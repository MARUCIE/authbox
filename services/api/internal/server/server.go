package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"auth-box-api/internal/config"
	"auth-box-api/internal/handlers"
	"auth-box-api/internal/repository"
	"auth-box-api/internal/security"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type Server struct {
	cfg        config.Config
	router     *chi.Mux
	srv        *http.Server
	auditRepo  *repository.AuditRepository
	authTokens map[string]security.Principal
}

func New(cfg config.Config) *Server {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// Health check (outside /api/v1)
	r.Get("/health", handlers.NewHealthHandler(cfg).ServeHTTP)

	// Initialize repositories
	platformRepo := repository.NewPlatformRepository()
	accountRepo := repository.NewAccountRepository(platformRepo)
	credentialRepo := repository.NewCredentialRepository(accountRepo)
	assistantRepo := repository.NewAssistantRepository(credentialRepo)
	auditRepo := repository.NewAuditRepository()
	authTokens, err := parseAuthTokens(cfg.AuthTokens)
	if err != nil {
		panic(fmt.Sprintf("invalid AUTH_BOX_AUTH_TOKENS: %v", err))
	}

	s := &Server{
		cfg:        cfg,
		router:     r,
		auditRepo:  auditRepo,
		authTokens: authTokens,
	}

	// Initialize handlers
	platformHandler := handlers.NewPlatformHandler(platformRepo, auditRepo)
	accountHandler := handlers.NewAccountHandler(accountRepo, auditRepo)
	credentialHandler := handlers.NewCredentialHandler(credentialRepo, auditRepo)
	assistantHandler := handlers.NewAssistantHandler(assistantRepo, auditRepo)
	auditHandler := handlers.NewAuditHandler(auditRepo)

	// API v1 routes
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(s.authn)

		// Platforms CRUD
		r.Route("/platforms", func(r chi.Router) {
			r.With(s.requireAnyRole("PLATFORM_LIST", rolePlatformAdmin, roleSecurityOps, roleComplianceAuditor, rolePolicyAdmin)).Get("/", platformHandler.List)
			r.With(s.requireAnyRole("PLATFORM_CREATE", rolePlatformAdmin)).Post("/", platformHandler.Create)
			r.With(s.requireAnyRole("PLATFORM_GET", rolePlatformAdmin, roleSecurityOps, roleComplianceAuditor, rolePolicyAdmin)).Get("/{id}", platformHandler.Get)
			r.With(s.requireAnyRole("PLATFORM_UPDATE", rolePlatformAdmin)).Patch("/{id}", platformHandler.Update)
			r.With(s.requireAnyRole("PLATFORM_DELETE", rolePlatformAdmin)).Delete("/{id}", platformHandler.Delete)
		})

		// Accounts CRUD
		r.Route("/accounts", func(r chi.Router) {
			r.With(s.requireAnyRole("ACCOUNT_LIST", rolePlatformAdmin, roleSecurityOps, roleComplianceAuditor, rolePolicyAdmin)).Get("/", accountHandler.List)
			r.With(s.requireAnyRole("ACCOUNT_CREATE", rolePlatformAdmin)).Post("/", accountHandler.Create)
			r.With(s.requireAnyRole("ACCOUNT_GET", rolePlatformAdmin, roleSecurityOps, roleComplianceAuditor, rolePolicyAdmin)).Get("/{id}", accountHandler.Get)
			r.With(s.requireAnyRole("ACCOUNT_UPDATE", rolePlatformAdmin)).Patch("/{id}", accountHandler.Update)
			r.With(s.requireAnyRole("ACCOUNT_DELETE", rolePlatformAdmin)).Delete("/{id}", accountHandler.Delete)
		})

		// Credentials
		r.Route("/credentials", func(r chi.Router) {
			r.With(s.requireAnyRole("CREDENTIAL_LIST", rolePlatformAdmin, roleSecurityOps)).Get("/", credentialHandler.List)
			r.With(s.requireAnyRole("CREDENTIAL_CREATE", rolePlatformAdmin, roleSecurityOps)).Post("/", credentialHandler.Create)
			r.With(s.requireAnyRole("CREDENTIAL_ROTATE", roleSecurityOps)).Post("/{id}/rotate", credentialHandler.Rotate)
			r.With(s.requireAnyRole("CREDENTIAL_REVOKE", roleSecurityOps)).Delete("/{id}", credentialHandler.Delete)
		})

		// Assistants
		r.Route("/assistants", func(r chi.Router) {
			r.With(s.requireAnyRole("ASSISTANT_LIST", rolePlatformAdmin, roleSecurityOps)).Get("/", assistantHandler.List)
			r.With(s.requireAnyRole("ASSISTANT_CREATE", rolePlatformAdmin, roleSecurityOps)).Post("/", assistantHandler.Create)
			r.With(s.requireAnyRole("ASSISTANT_GET", rolePlatformAdmin, roleSecurityOps)).Get("/{id}", assistantHandler.Get)
			r.With(s.requireAnyRole("ASSISTANT_BIND", roleSecurityOps)).Post("/{id}/bind", assistantHandler.Bind)
		})

		// Audit
		r.Route("/audit", func(r chi.Router) {
			r.With(s.requireAnyRole("AUDIT_LIST", rolePlatformAdmin, roleComplianceAuditor)).Get("/", auditHandler.List)
			r.With(s.requireAnyRole("AUDIT_EXPORT_CREATE", roleComplianceAuditor)).Post("/exports", auditHandler.CreateExport)
			r.With(s.requireAnyRole("AUDIT_EXPORT_GET", rolePlatformAdmin, roleComplianceAuditor)).Get("/exports/{id}", auditHandler.GetExport)
		})
	})

	return s
}

func (s *Server) Run(ctx context.Context) error {
	s.srv = &http.Server{
		Addr:              s.cfg.HTTPAddr,
		Handler:           s.router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("api server started", "addr", s.cfg.HTTPAddr)
		errCh <- s.srv.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		return s.srv.Shutdown(context.Background())
	case err := <-errCh:
		return err
	}
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.srv == nil {
		return nil
	}
	return s.srv.Shutdown(ctx)
}
