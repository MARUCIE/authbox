package pg

import (
	"context"
	"errors"

	"auth-box-api/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// sentinel aliases for brevity
var (
	errAgentNotFound  = domain.ErrAgentNotFound
	errPolicyNotFound = domain.ErrPolicyNotFound
)

type AgentRepository struct {
	pool *pgxpool.Pool
}

func NewAgentRepository(pool *pgxpool.Pool) *AgentRepository {
	return &AgentRepository{pool: pool}
}

// --- Agent CRUD ---

func (r *AgentRepository) CreateAgent(ctx context.Context, agent *domain.Agent) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO agents (user_id, name, description, agent_type, api_key_hash, status)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, created_at, updated_at`,
		agent.UserID, agent.Name, agent.Description, agent.AgentType, agent.APIKeyHash, agent.Status,
	).Scan(&agent.ID, &agent.CreatedAt, &agent.UpdatedAt)
}

func (r *AgentRepository) GetAgent(ctx context.Context, id, userID uuid.UUID) (*domain.Agent, error) {
	agent := &domain.Agent{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, name, description, agent_type, api_key_hash, status, last_active_at, created_at, updated_at
		 FROM agents WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&agent.ID, &agent.UserID, &agent.Name, &agent.Description, &agent.AgentType, &agent.APIKeyHash, &agent.Status, &agent.LastActiveAt, &agent.CreatedAt, &agent.UpdatedAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return agent, err
}

func (r *AgentRepository) ListAgents(ctx context.Context, userID uuid.UUID) ([]domain.Agent, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, name, description, agent_type, api_key_hash, status, last_active_at, created_at, updated_at
		 FROM agents WHERE user_id = $1 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []domain.Agent
	for rows.Next() {
		var a domain.Agent
		if err := rows.Scan(&a.ID, &a.UserID, &a.Name, &a.Description, &a.AgentType, &a.APIKeyHash, &a.Status, &a.LastActiveAt, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		agents = append(agents, a)
	}
	return agents, rows.Err()
}

func (r *AgentRepository) UpdateAgent(ctx context.Context, agent *domain.Agent) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE agents SET name = $1, description = $2, agent_type = $3, status = $4, updated_at = NOW()
		 WHERE id = $5 AND user_id = $6`,
		agent.Name, agent.Description, agent.AgentType, agent.Status, agent.ID, agent.UserID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errAgentNotFound
	}
	return nil
}

func (r *AgentRepository) DeleteAgent(ctx context.Context, id, userID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM agents WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errAgentNotFound
	}
	return nil
}

// --- AgentPolicy CRUD ---

func (r *AgentRepository) CreatePolicy(ctx context.Context, policy *domain.AgentPolicy) error {
	return r.pool.QueryRow(ctx,
		`INSERT INTO agent_policies (agent_id, policy_type, rules, scope_filter, priority, enabled)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, created_at, updated_at`,
		policy.AgentID, policy.PolicyType, policy.Rules, policy.ScopeFilter, policy.Priority, policy.Enabled,
	).Scan(&policy.ID, &policy.CreatedAt, &policy.UpdatedAt)
}

func (r *AgentRepository) ListPolicies(ctx context.Context, agentID uuid.UUID) ([]domain.AgentPolicy, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, agent_id, policy_type, rules, scope_filter, priority, enabled, created_at, updated_at
		 FROM agent_policies WHERE agent_id = $1 ORDER BY priority ASC`,
		agentID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var policies []domain.AgentPolicy
	for rows.Next() {
		var p domain.AgentPolicy
		if err := rows.Scan(&p.ID, &p.AgentID, &p.PolicyType, &p.Rules, &p.ScopeFilter, &p.Priority, &p.Enabled, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		policies = append(policies, p)
	}
	return policies, rows.Err()
}

func (r *AgentRepository) UpdatePolicy(ctx context.Context, policy *domain.AgentPolicy) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE agent_policies SET policy_type = $1, rules = $2, scope_filter = $3, priority = $4, enabled = $5, updated_at = NOW()
		 WHERE id = $6 AND agent_id = $7`,
		policy.PolicyType, policy.Rules, policy.ScopeFilter, policy.Priority, policy.Enabled, policy.ID, policy.AgentID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errPolicyNotFound
	}
	return nil
}

func (r *AgentRepository) DeletePolicy(ctx context.Context, id, agentID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM agent_policies WHERE id = $1 AND agent_id = $2`,
		id, agentID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errPolicyNotFound
	}
	return nil
}
