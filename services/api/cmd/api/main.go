package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"auth-box-api/internal/auth"
	"auth-box-api/internal/config"
	"auth-box-api/internal/handler"
	appmw "auth-box-api/internal/middleware"
	"auth-box-api/internal/repository/pg"
	"auth-box-api/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
)

func runMigrations(dsn, migrationsDir string, down bool) error {
	sourceURL := "file://" + migrationsDir

	// golang-migrate's pgx/v5 driver registers for "pgx5://" scheme,
	// so convert standard "postgres://" DSN to the expected format.
	migrateDSN := strings.Replace(dsn, "postgres://", "pgx5://", 1)
	migrateDSN = strings.Replace(migrateDSN, "postgresql://", "pgx5://", 1)

	m, err := migrate.New(sourceURL, migrateDSN)
	if err != nil {
		return err
	}
	defer m.Close()

	if down {
		if err := m.Steps(-1); err != nil && !errors.Is(err, migrate.ErrNoChange) {
			return err
		}
		slog.Info("rolled back one migration")
		return nil
	}

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}

	version, dirty, _ := m.Version()
	slog.Info("migrations applied", "version", version, "dirty", dirty)
	return nil
}

func main() {
	migrateOnly := flag.Bool("migrate-only", false, "Run migrations and exit")
	migrateDown := flag.Bool("migrate-down", false, "Rollback last migration and exit")
	migrationsDir := flag.String("migrations-dir", "./migrations", "Path to migrations directory")
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()

	// Connect to PostgreSQL
	if cfg.DBDSN == "" {
		slog.Error("AUTH_BOX_DB_DSN is required")
		os.Exit(1)
	}

	// Handle migration-only modes
	if *migrateOnly || *migrateDown {
		if err := runMigrations(cfg.DBDSN, *migrationsDir, *migrateDown); err != nil {
			slog.Error("migration failed", "error", err)
			os.Exit(1)
		}
		if *migrateOnly {
			slog.Info("migrations complete, exiting")
		}
		os.Exit(0)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	poolCfg, err := pgxpool.ParseConfig(cfg.DBDSN)
	if err != nil {
		slog.Error("failed to parse database config", "error", err)
		os.Exit(1)
	}
	poolCfg.MaxConns = 20
	poolCfg.MinConns = 2
	poolCfg.MaxConnLifetime = 30 * time.Minute
	poolCfg.MaxConnIdleTime = 5 * time.Minute
	poolCfg.HealthCheckPeriod = 30 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		slog.Error("failed to ping database", "error", err)
		os.Exit(1)
	}
	slog.Info("connected to database", "maxConns", poolCfg.MaxConns)

	// Repositories
	userRepo := pg.NewUserRepository(pool)
	sessionRepo := pg.NewSessionRepository(pool)
	vaultRepo := pg.NewVaultRepository(pool)
	agentRepo := pg.NewAgentRepository(pool)
	connRepo := pg.NewConnectionRepository(pool)
	auditRepo := pg.NewAuditRepository(pool)
	walletRepo := pg.NewWalletRepository(pool)

	// Services
	totpService := service.NewTOTPService(userRepo, cfg.TOTPSecretKey)
	authService := service.NewAuthService(userRepo, sessionRepo, totpService, cfg.SessionTTL)
	vaultService := service.NewVaultService(userRepo, vaultRepo)
	agentService := service.NewAgentService(agentRepo)
	connService := service.NewConnectionService(connRepo)
	auditService := service.NewAuditService(auditRepo)
	walletService := service.NewWalletService(walletRepo, service.NewBalanceProvider())

	// Handlers
	authHandler := handler.NewAuthHandler(authService, cfg.AuthRateLimit)
	totpHandler := handler.NewTOTPHandler(totpService)
	vaultHandler := handler.NewVaultHandler(vaultService)
	agentHandler := handler.NewAgentHandler(agentService)
	connectionHandler := handler.NewConnectionHandler(connService)
	auditHandler := handler.NewAuditHandler(auditService)
	walletHandler := handler.NewWalletHandler(walletService)
	healthHandler := handler.NewHealthHandler(cfg)

	// AUD-AUTH-02: configure the trusted-proxy allowlist before serving. Empty =
	// trust no proxy; X-Forwarded-For is then ignored and the real socket peer keys
	// rate-limiting/auditing, so header rotation cannot defeat the per-IP gate.
	appmw.SetTrustedProxies(cfg.TrustedProxies)

	// Rate limiters
	authLimiter := appmw.NewRateLimiter(cfg.AuthRateLimit, 1*time.Minute)
	protectedLimiter := appmw.NewRateLimiter(120, 1*time.Minute)

	// Router
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	// NOTE: chi's middleware.RealIP is deliberately NOT used — it rewrites
	// RemoteAddr from X-Forwarded-For/X-Real-IP unconditionally, which an attacker
	// can spoof. appmw.ClientIP is the single, trusted-proxy-aware authority instead.
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(appmw.SecurityHeaders)
	r.Use(appmw.RequireJSON)
	r.Use(appmw.BodySizeLimit(1 << 20)) // 1 MB max request body

	// CORS + Chrome Private Network Access (PNA)
	// PNA middleware wraps the ResponseWriter so the header is present
	// when go-chi/cors calls WriteHeader(200) on OPTIONS preflight.
	r.Use(appmw.PrivateNetworkAccess)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Access-Control-Request-Private-Network"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Public routes
	r.Get("/health", healthHandler.Health)

	// API v1 routes
	r.Route("/api/v1", func(r chi.Router) {
		// Public auth routes (rate-limited, no auth required)
		r.Group(func(r chi.Router) {
			r.Use(authLimiter.Handler)
			r.Post("/auth/register", authHandler.Register)
			r.Post("/auth/login/init", authHandler.LoginInit)
			r.Post("/auth/login/verify", authHandler.LoginVerify)
			r.Post("/auth/login/totp/verify", authHandler.LoginVerifyTOTP)
		})

		// Protected routes (require valid session + rate limit)
		r.Group(func(r chi.Router) {
			r.Use(auth.Middleware(authService))
			r.Use(protectedLimiter.Handler)

			r.Post("/auth/logout", authHandler.Logout)
			r.Get("/auth/sessions", authHandler.ListSessions)
			r.Delete("/auth/sessions/{sessionId}", authHandler.RevokeSession)
			r.Delete("/auth/sessions", authHandler.RevokeAllSessions)

			r.Get("/auth/totp/status", totpHandler.Status)
			r.Post("/auth/totp/enroll", totpHandler.Enroll)
			r.Post("/auth/totp/verify", totpHandler.Verify)
			r.Post("/auth/totp/disable", totpHandler.Disable)

			r.Get("/vault/key", vaultHandler.GetVaultKey)
			r.Get("/vault/sync", vaultHandler.SyncPull)
			r.Post("/vault/sync", vaultHandler.SyncPush)

			r.Get("/vault/items", vaultHandler.ListItems)
			r.Post("/vault/items", vaultHandler.CreateItem)
			r.Get("/vault/items/{id}", vaultHandler.GetItem)
			r.Put("/vault/items/{id}", vaultHandler.UpdateItem)
			r.Delete("/vault/items/{id}", vaultHandler.DeleteItem)

			r.Route("/agents", func(r chi.Router) {
				r.Post("/", agentHandler.CreateAgent)
				r.Get("/", agentHandler.ListAgents)
				r.Route("/{id}", func(r chi.Router) {
					r.Get("/", agentHandler.GetAgent)
					r.Put("/", agentHandler.UpdateAgent)
					r.Delete("/", agentHandler.DeleteAgent)
					r.Route("/policies", func(r chi.Router) {
						r.Post("/", agentHandler.CreatePolicy)
						r.Get("/", agentHandler.ListPolicies)
						r.Put("/{pid}", agentHandler.UpdatePolicy)
						r.Delete("/{pid}", agentHandler.DeletePolicy)
					})
				})
			})

			r.Route("/connections", func(r chi.Router) {
				r.Post("/", connectionHandler.CreateConnection)
				r.Get("/", connectionHandler.ListConnections)
				r.Route("/{id}", func(r chi.Router) {
					r.Get("/", connectionHandler.GetConnection)
					r.Put("/", connectionHandler.UpdateConnection)
					r.Delete("/", connectionHandler.DeleteConnection)
				})
			})

			r.Route("/audit", func(r chi.Router) {
				r.Get("/", auditHandler.ListEvents)
				r.Get("/verify", auditHandler.VerifyChain)
			})

			r.Route("/wallet/accounts", func(r chi.Router) {
				r.Post("/", walletHandler.CreateAccount)
				r.Get("/", walletHandler.ListAccounts)
				r.Route("/{id}", func(r chi.Router) {
					r.Delete("/", walletHandler.DeleteAccount)
					r.Get("/balance", walletHandler.Balance)
					r.Post("/addresses", walletHandler.AddAddress)
					r.Get("/addresses", walletHandler.ListAddresses)
				})
			})
		})
	})

	// Start server with full timeout suite to prevent slowloris attacks.
	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MB
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("api server started", "addr", cfg.HTTPAddr, "env", cfg.Environment)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		slog.Info("shutting down gracefully")
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server stopped with error", "error", err)
			os.Exit(1)
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "error", err)
	}
}
