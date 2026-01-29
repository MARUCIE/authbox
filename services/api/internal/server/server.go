package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"auth-box-api/internal/config"
	"auth-box-api/internal/handlers"
	"auth-box-api/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type Server struct {
	cfg    config.Config
	router *chi.Mux
	srv    *http.Server
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

	// Initialize handlers
	platformHandler := handlers.NewPlatformHandler(platformRepo)

	// API v1 routes
	r.Route("/api/v1", func(r chi.Router) {
		// Platforms CRUD
		r.Route("/platforms", func(r chi.Router) {
			r.Get("/", platformHandler.List)
			r.Post("/", platformHandler.Create)
			r.Get("/{id}", platformHandler.Get)
			r.Patch("/{id}", platformHandler.Update)
			r.Delete("/{id}", platformHandler.Delete)
		})
	})

	return &Server{
		cfg:    cfg,
		router: r,
	}
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
