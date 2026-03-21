/**
 * AI Infrastructure Credential Catalog
 *
 * Static registry of 70+ providers across 15 categories.
 * Used client-side for:
 *   - Credential creation templates (which fields each provider needs)
 *   - .env file auto-classification (env var name -> provider mapping)
 *   - Import preview UI (category badges, provider icons)
 *   - MCP Gateway policy scoping (by category/provider)
 *
 * Zero-knowledge: this catalog is purely client-side metadata.
 * The server never sees plaintext credentials or provider assignments.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface CredentialCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
}

export type AuthPattern =
  | 'api_key'
  | 'api_key_secret'
  | 'bearer_token'
  | 'oauth2'
  | 'service_account_json'
  | 'access_key_secret'
  | 'bot_token';

export interface CredentialField {
  key: string;
  label: string;
  type: 'secret' | 'text' | 'url' | 'json' | 'file';
  required: boolean;
  placeholder: string;
  helpText: string;
  validation?: string;
}

export interface ProviderTemplate {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  website: string;
  fields: CredentialField[];
  authPattern: AuthPattern;
  tags: string[];
}

export interface EnvPattern {
  pattern: RegExp;
  providerId: string;
  fieldKey: string;
}

// ─── Categories (15) ──────────────────────────────────────────────────────

export const CREDENTIAL_CATEGORIES: CredentialCategory[] = [
  { id: 'llm', name: 'LLM', description: 'Large language model inference APIs', icon: 'Brain', sortOrder: 1 },
  { id: 'image_video', name: 'Image/Video', description: 'Visual content generation and editing', icon: 'Image', sortOrder: 2 },
  { id: 'embedding_vector', name: 'Embedding & Vector', description: 'Embedding models and vector storage', icon: 'Database', sortOrder: 3 },
  { id: 'search_web', name: 'Search & Web', description: 'Web search and content extraction', icon: 'Search', sortOrder: 4 },
  { id: 'cloud_infra', name: 'Cloud Infrastructure', description: 'IaaS/PaaS provider credentials', icon: 'Cloud', sortOrder: 5 },
  { id: 'code_dev', name: 'Code & Dev Tools', description: 'Source control, databases, caches', icon: 'Code', sortOrder: 6 },
  { id: 'communication', name: 'Communication', description: 'Messaging bots, email, SMS', icon: 'MessageSquare', sortOrder: 7 },
  { id: 'payment', name: 'Payment', description: 'Payment processing and billing', icon: 'CreditCard', sortOrder: 8 },
  { id: 'observability', name: 'Observability', description: 'APM, logging, LLM tracing', icon: 'Activity', sortOrder: 9 },
  { id: 'auth_identity', name: 'Auth & Identity', description: 'Identity providers and SSO', icon: 'Shield', sortOrder: 10 },
  { id: 'storage', name: 'Object Storage', description: 'File and blob storage services', icon: 'HardDrive', sortOrder: 11 },
  { id: 'analytics', name: 'Analytics', description: 'Product analytics and CDP', icon: 'BarChart', sortOrder: 12 },
  { id: 'workflow', name: 'Workflow', description: 'iPaaS and workflow orchestration', icon: 'GitBranch', sortOrder: 13 },
  { id: 'domain_dns', name: 'Domain & DNS', description: 'Domain registration and DNS management', icon: 'Globe', sortOrder: 14 },
  { id: 'container_compute', name: 'Container & Compute', description: 'Container registries and serverless compute', icon: 'Box', sortOrder: 15 },
];

// ─── Helper: create a simple api_key field ────────────────────────────────

function apiKeyField(placeholder = 'sk-...', helpText = 'Found in provider dashboard'): CredentialField {
  return { key: 'api_key', label: 'API Key', type: 'secret', required: true, placeholder, helpText };
}

function secretField(key: string, label: string, placeholder = '', helpText = ''): CredentialField {
  return { key, label, type: 'secret', required: true, placeholder, helpText };
}

function textField(key: string, label: string, required = false, placeholder = '', helpText = ''): CredentialField {
  return { key, label, type: 'text', required, placeholder, helpText };
}

function urlField(key: string, label: string, required = false, placeholder = '', helpText = ''): CredentialField {
  return { key, label, type: 'url', required, placeholder, helpText };
}

// ─── Providers (70+) ──────────────────────────────────────────────────────

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  // ── LLM Providers (15) ──────────────────────────────────────────────────
  { id: 'openai', categoryId: 'llm', name: 'OpenAI', description: 'GPT-4o, o3, DALL-E, Whisper, Embeddings', website: 'https://platform.openai.com', authPattern: 'api_key', tags: ['tier-1', 'chat', 'embedding', 'image', 'audio'],
    fields: [apiKeyField('sk-...', 'platform.openai.com/api-keys'), textField('org_id', 'Organization ID', false, 'org-...'), textField('project_id', 'Project ID'), urlField('base_url', 'Base URL', false, 'https://api.openai.com/v1')] },
  { id: 'anthropic', categoryId: 'llm', name: 'Anthropic', description: 'Claude Opus, Sonnet, Haiku', website: 'https://console.anthropic.com', authPattern: 'api_key', tags: ['tier-1', 'chat'],
    fields: [apiKeyField('sk-ant-...', 'console.anthropic.com/settings/keys')] },
  { id: 'google_ai', categoryId: 'llm', name: 'Google AI', description: 'Gemini 2.5 Pro/Flash, Imagen, Embedding', website: 'https://aistudio.google.com', authPattern: 'api_key', tags: ['tier-1', 'chat', 'embedding', 'image'],
    fields: [apiKeyField('AIza...', 'aistudio.google.com/apikey')] },
  { id: 'xai', categoryId: 'llm', name: 'xAI', description: 'Grok 3, Grok 3 Mini', website: 'https://console.x.ai', authPattern: 'api_key', tags: ['tier-1', 'chat', 'search'],
    fields: [apiKeyField('xai-...', 'console.x.ai/team/api-keys')] },
  { id: 'deepseek', categoryId: 'llm', name: 'DeepSeek', description: 'DeepSeek V4, R2', website: 'https://platform.deepseek.com', authPattern: 'api_key', tags: ['tier-2', 'chat', 'code'],
    fields: [apiKeyField('sk-...', 'platform.deepseek.com/api_keys')] },
  { id: 'qwen', categoryId: 'llm', name: 'Qwen (Alibaba)', description: 'Qwen 3 235B, Qwen-VL', website: 'https://dashscope.console.aliyun.com', authPattern: 'api_key', tags: ['tier-2', 'chat', 'vision'],
    fields: [apiKeyField('sk-...', 'DashScope console')] },
  { id: 'mistral', categoryId: 'llm', name: 'Mistral', description: 'Mistral Large, Codestral', website: 'https://console.mistral.ai', authPattern: 'api_key', tags: ['tier-2', 'chat', 'code'],
    fields: [apiKeyField()] },
  { id: 'cohere', categoryId: 'llm', name: 'Cohere', description: 'Command R+, Embed, Rerank', website: 'https://dashboard.cohere.com', authPattern: 'api_key', tags: ['tier-2', 'chat', 'embedding', 'rerank'],
    fields: [apiKeyField()] },
  { id: 'together', categoryId: 'llm', name: 'Together AI', description: 'Open-source model hosting', website: 'https://api.together.xyz', authPattern: 'api_key', tags: ['aggregator', 'chat'],
    fields: [apiKeyField()] },
  { id: 'fireworks', categoryId: 'llm', name: 'Fireworks AI', description: 'Fast inference for open models', website: 'https://fireworks.ai', authPattern: 'api_key', tags: ['aggregator', 'chat'],
    fields: [apiKeyField()] },
  { id: 'groq', categoryId: 'llm', name: 'Groq', description: 'Ultra-fast LPU inference', website: 'https://console.groq.com', authPattern: 'api_key', tags: ['aggregator', 'chat', 'fast'],
    fields: [apiKeyField('gsk_...')] },
  { id: 'cerebras', categoryId: 'llm', name: 'Cerebras', description: 'Wafer-scale inference', website: 'https://cloud.cerebras.ai', authPattern: 'api_key', tags: ['aggregator', 'chat', 'fast'],
    fields: [apiKeyField()] },
  { id: 'sambanova', categoryId: 'llm', name: 'SambaNova', description: 'DataScale inference', website: 'https://cloud.sambanova.ai', authPattern: 'api_key', tags: ['aggregator', 'chat'],
    fields: [apiKeyField()] },
  { id: 'openrouter', categoryId: 'llm', name: 'OpenRouter', description: 'Multi-model aggregator', website: 'https://openrouter.ai', authPattern: 'api_key', tags: ['aggregator', 'chat'],
    fields: [apiKeyField('sk-or-...')] },
  { id: 'ai21', categoryId: 'llm', name: 'AI21 Labs', description: 'Jamba models', website: 'https://studio.ai21.com', authPattern: 'api_key', tags: ['tier-2', 'chat'],
    fields: [apiKeyField()] },

  // ── Image/Video Generation (10) ─────────────────────────────────────────
  { id: 'stability', categoryId: 'image_video', name: 'Stability AI', description: 'Stable Diffusion, SDXL', website: 'https://platform.stability.ai', authPattern: 'api_key', tags: ['image'],
    fields: [apiKeyField('sk-...')] },
  { id: 'replicate', categoryId: 'image_video', name: 'Replicate', description: 'Open-source model hosting', website: 'https://replicate.com', authPattern: 'bearer_token', tags: ['image', 'video', 'audio'],
    fields: [secretField('api_token', 'API Token', 'r8_...', 'replicate.com/account/api-tokens')] },
  { id: 'runway', categoryId: 'image_video', name: 'RunwayML', description: 'Gen-3 Alpha video generation', website: 'https://runwayml.com', authPattern: 'api_key', tags: ['video'],
    fields: [apiKeyField()] },
  { id: 'heygen', categoryId: 'image_video', name: 'HeyGen', description: 'AI avatar videos, TTS, translation', website: 'https://heygen.com', authPattern: 'api_key', tags: ['video', 'avatar', 'tts'],
    fields: [apiKeyField('', 'app.heygen.com/settings')] },
  { id: 'pika', categoryId: 'image_video', name: 'Pika', description: 'AI video generation', website: 'https://pika.art', authPattern: 'api_key', tags: ['video'],
    fields: [apiKeyField()] },
  { id: 'kling', categoryId: 'image_video', name: 'Kling (Kuaishou)', description: 'Kling 3.0 video generation', website: 'https://klingai.com', authPattern: 'api_key_secret', tags: ['video'],
    fields: [secretField('access_key', 'Access Key'), secretField('secret_key', 'Secret Key')] },
  { id: 'luma', categoryId: 'image_video', name: 'Luma AI', description: 'Dream Machine video', website: 'https://lumalabs.ai', authPattern: 'api_key', tags: ['video', '3d'],
    fields: [apiKeyField()] },
  { id: 'elevenlabs', categoryId: 'image_video', name: 'ElevenLabs', description: 'Voice synthesis and cloning', website: 'https://elevenlabs.io', authPattern: 'api_key', tags: ['audio', 'tts', 'voice'],
    fields: [apiKeyField('', 'elevenlabs.io/app/settings/api-keys')] },
  { id: 'fal', categoryId: 'image_video', name: 'Fal.ai', description: 'Fast image/video inference', website: 'https://fal.ai', authPattern: 'api_key', tags: ['image', 'video'],
    fields: [apiKeyField()] },
  { id: 'libtv', categoryId: 'image_video', name: 'LibTV (liblib.tv)', description: 'Seedance 2.0, AI video/image', website: 'https://liblib.tv', authPattern: 'api_key', tags: ['image', 'video'],
    fields: [secretField('access_key', 'Access Key', '', 'LibTV dashboard')] },

  // ── Embedding & Vector DB (7) ───────────────────────────────────────────
  { id: 'pinecone', categoryId: 'embedding_vector', name: 'Pinecone', description: 'Managed vector database', website: 'https://pinecone.io', authPattern: 'api_key', tags: ['vector'],
    fields: [apiKeyField(), textField('environment', 'Environment', false, 'us-east-1-aws')] },
  { id: 'weaviate', categoryId: 'embedding_vector', name: 'Weaviate Cloud', description: 'Vector search engine', website: 'https://weaviate.io', authPattern: 'api_key', tags: ['vector'],
    fields: [apiKeyField(), urlField('cluster_url', 'Cluster URL', true)] },
  { id: 'qdrant', categoryId: 'embedding_vector', name: 'Qdrant Cloud', description: 'Vector similarity search', website: 'https://qdrant.io', authPattern: 'api_key', tags: ['vector'],
    fields: [apiKeyField(), urlField('cluster_url', 'Cluster URL', true)] },
  { id: 'milvus', categoryId: 'embedding_vector', name: 'Zilliz (Milvus)', description: 'Managed Milvus', website: 'https://zilliz.com', authPattern: 'api_key', tags: ['vector'],
    fields: [apiKeyField(), urlField('endpoint', 'Endpoint', true)] },
  { id: 'voyage', categoryId: 'embedding_vector', name: 'Voyage AI', description: 'Embedding models', website: 'https://voyageai.com', authPattern: 'api_key', tags: ['embedding'],
    fields: [apiKeyField()] },
  { id: 'jina', categoryId: 'embedding_vector', name: 'Jina AI', description: 'Embeddings, reranking, reader', website: 'https://jina.ai', authPattern: 'api_key', tags: ['embedding', 'rerank'],
    fields: [apiKeyField('jina_...')] },
  { id: 'chroma', categoryId: 'embedding_vector', name: 'Chroma Cloud', description: 'AI-native embedding database', website: 'https://trychroma.com', authPattern: 'api_key', tags: ['vector'],
    fields: [apiKeyField(), textField('tenant_id', 'Tenant ID')] },

  // ── Search & Web Access (7) ─────────────────────────────────────────────
  { id: 'brave_search', categoryId: 'search_web', name: 'Brave Search', description: 'Independent search API', website: 'https://brave.com/search/api', authPattern: 'api_key', tags: ['search'],
    fields: [apiKeyField('BSA...')] },
  { id: 'serpapi', categoryId: 'search_web', name: 'SerpAPI', description: 'Google/Bing search scraping', website: 'https://serpapi.com', authPattern: 'api_key', tags: ['search'],
    fields: [apiKeyField()] },
  { id: 'tavily', categoryId: 'search_web', name: 'Tavily', description: 'AI-optimized search', website: 'https://tavily.com', authPattern: 'api_key', tags: ['search', 'agent'],
    fields: [apiKeyField('tvly-...')] },
  { id: 'exa', categoryId: 'search_web', name: 'Exa', description: 'Neural search engine', website: 'https://exa.ai', authPattern: 'api_key', tags: ['search', 'agent'],
    fields: [apiKeyField()] },
  { id: 'bing_search', categoryId: 'search_web', name: 'Bing Search (Azure)', description: 'Microsoft Bing Web Search', website: 'https://azure.microsoft.com', authPattern: 'api_key', tags: ['search'],
    fields: [apiKeyField(), urlField('endpoint', 'Endpoint', false, 'https://api.bing.microsoft.com')] },
  { id: 'google_search', categoryId: 'search_web', name: 'Google Custom Search', description: 'Programmable Search Engine', website: 'https://developers.google.com/custom-search', authPattern: 'api_key', tags: ['search'],
    fields: [apiKeyField(), textField('cx', 'Search Engine ID', true)] },
  { id: 'perplexity', categoryId: 'search_web', name: 'Perplexity', description: 'AI search with citations', website: 'https://perplexity.ai', authPattern: 'api_key', tags: ['search', 'chat'],
    fields: [apiKeyField('pplx-...')] },

  // ── Cloud Infrastructure (9) ────────────────────────────────────────────
  { id: 'aws', categoryId: 'cloud_infra', name: 'AWS', description: 'Amazon Web Services', website: 'https://aws.amazon.com', authPattern: 'access_key_secret', tags: ['iaas', 's3', 'lambda', 'bedrock'],
    fields: [secretField('access_key_id', 'Access Key ID', 'AKIA...'), secretField('secret_access_key', 'Secret Access Key'), textField('region', 'Region', false, 'us-east-1'), secretField('session_token', 'Session Token (optional)', '')] },
  { id: 'gcp', categoryId: 'cloud_infra', name: 'Google Cloud', description: 'GCP / Vertex AI', website: 'https://console.cloud.google.com', authPattern: 'service_account_json', tags: ['iaas', 'vertex'],
    fields: [{ key: 'service_account_json', label: 'Service Account JSON', type: 'json', required: true, placeholder: '{"type":"service_account",...}', helpText: 'IAM > Service Accounts > Keys > JSON' }, textField('project_id', 'Project ID')] },
  { id: 'azure', categoryId: 'cloud_infra', name: 'Azure', description: 'Microsoft Azure / Azure OpenAI', website: 'https://portal.azure.com', authPattern: 'oauth2', tags: ['iaas', 'azure_openai'],
    fields: [textField('tenant_id', 'Tenant ID', true), textField('client_id', 'Client ID', true), secretField('client_secret', 'Client Secret'), textField('subscription_id', 'Subscription ID')] },
  { id: 'cloudflare', categoryId: 'cloud_infra', name: 'Cloudflare', description: 'Workers, R2, D1, Pages', website: 'https://dash.cloudflare.com', authPattern: 'bearer_token', tags: ['edge', 'cdn', 'workers'],
    fields: [secretField('api_token', 'API Token'), textField('account_id', 'Account ID')] },
  { id: 'vercel', categoryId: 'cloud_infra', name: 'Vercel', description: 'Frontend deployment platform', website: 'https://vercel.com', authPattern: 'bearer_token', tags: ['paas', 'frontend'],
    fields: [secretField('api_token', 'API Token'), textField('team_id', 'Team ID')] },
  { id: 'netlify', categoryId: 'cloud_infra', name: 'Netlify', description: 'Web deployment platform', website: 'https://netlify.com', authPattern: 'bearer_token', tags: ['paas', 'frontend'],
    fields: [secretField('api_token', 'API Token')] },
  { id: 'railway', categoryId: 'cloud_infra', name: 'Railway', description: 'Cloud deployment platform', website: 'https://railway.app', authPattern: 'bearer_token', tags: ['paas'],
    fields: [secretField('api_token', 'API Token')] },
  { id: 'flyio', categoryId: 'cloud_infra', name: 'Fly.io', description: 'Edge compute platform', website: 'https://fly.io', authPattern: 'bearer_token', tags: ['paas', 'edge'],
    fields: [secretField('api_token', 'API Token'), textField('org_slug', 'Org Slug')] },
  { id: 'digitalocean', categoryId: 'cloud_infra', name: 'DigitalOcean', description: 'Cloud infrastructure', website: 'https://digitalocean.com', authPattern: 'bearer_token', tags: ['iaas'],
    fields: [secretField('api_token', 'API Token')] },

  // ── Code & Dev Tools (7) ────────────────────────────────────────────────
  { id: 'github', categoryId: 'code_dev', name: 'GitHub', description: 'Source control, Actions, Packages', website: 'https://github.com', authPattern: 'bearer_token', tags: ['git', 'ci'],
    fields: [secretField('personal_access_token', 'Personal Access Token', 'ghp_...', 'Settings > Developer settings > PAT'), textField('org', 'Organization')] },
  { id: 'gitlab', categoryId: 'code_dev', name: 'GitLab', description: 'DevOps platform', website: 'https://gitlab.com', authPattern: 'bearer_token', tags: ['git', 'ci'],
    fields: [secretField('personal_access_token', 'Access Token', 'glpat-...'), urlField('instance_url', 'Instance URL', false, 'https://gitlab.com')] },
  { id: 'supabase', categoryId: 'code_dev', name: 'Supabase', description: 'PostgreSQL, Auth, Storage, Realtime', website: 'https://supabase.com', authPattern: 'api_key', tags: ['baas', 'db', 'auth'],
    fields: [apiKeyField('eyJ...', 'anon key'), secretField('service_role_key', 'Service Role Key', 'eyJ...'), urlField('project_url', 'Project URL', true, 'https://xxx.supabase.co')] },
  { id: 'neon', categoryId: 'code_dev', name: 'Neon', description: 'Serverless Postgres', website: 'https://neon.tech', authPattern: 'api_key', tags: ['db', 'postgres'],
    fields: [apiKeyField(), urlField('connection_string', 'Connection String', false, 'postgres://...')] },
  { id: 'turso', categoryId: 'code_dev', name: 'Turso', description: 'Edge SQLite (libSQL)', website: 'https://turso.tech', authPattern: 'bearer_token', tags: ['db', 'sqlite'],
    fields: [secretField('api_token', 'API Token'), urlField('database_url', 'Database URL', false, 'libsql://...')] },
  { id: 'upstash', categoryId: 'code_dev', name: 'Upstash', description: 'Serverless Redis + Kafka', website: 'https://upstash.com', authPattern: 'api_key', tags: ['cache', 'redis'],
    fields: [apiKeyField(), urlField('rest_url', 'REST URL', true, 'https://xxx.upstash.io')] },
  { id: 'planetscale', categoryId: 'code_dev', name: 'PlanetScale', description: 'Serverless MySQL', website: 'https://planetscale.com', authPattern: 'api_key_secret', tags: ['db', 'mysql'],
    fields: [textField('service_token_id', 'Service Token ID', true), secretField('service_token', 'Service Token')] },

  // ── Communication (7) ───────────────────────────────────────────────────
  { id: 'telegram', categoryId: 'communication', name: 'Telegram Bot', description: 'Bot API for messaging', website: 'https://core.telegram.org/bots/api', authPattern: 'bot_token', tags: ['bot', 'im'],
    fields: [secretField('bot_token', 'Bot Token', '123456:ABC-...', '@BotFather')] },
  { id: 'discord', categoryId: 'communication', name: 'Discord Bot', description: 'Bot for Discord servers', website: 'https://discord.com/developers', authPattern: 'bot_token', tags: ['bot', 'im'],
    fields: [secretField('bot_token', 'Bot Token'), textField('client_id', 'Client ID'), secretField('client_secret', 'Client Secret')] },
  { id: 'slack', categoryId: 'communication', name: 'Slack Bot', description: 'Workspace bot and apps', website: 'https://api.slack.com', authPattern: 'bot_token', tags: ['bot', 'im'],
    fields: [secretField('bot_token', 'Bot Token', 'xoxb-...'), secretField('signing_secret', 'Signing Secret'), secretField('app_token', 'App Token (optional)', 'xapp-...')] },
  { id: 'sendgrid', categoryId: 'communication', name: 'SendGrid', description: 'Email delivery API', website: 'https://sendgrid.com', authPattern: 'api_key', tags: ['email'],
    fields: [apiKeyField('SG..')] },
  { id: 'resend', categoryId: 'communication', name: 'Resend', description: 'Modern email API', website: 'https://resend.com', authPattern: 'api_key', tags: ['email'],
    fields: [apiKeyField('re_...')] },
  { id: 'twilio', categoryId: 'communication', name: 'Twilio', description: 'SMS, voice, WhatsApp', website: 'https://twilio.com', authPattern: 'api_key_secret', tags: ['sms', 'voice'],
    fields: [textField('account_sid', 'Account SID', true, 'AC...'), secretField('auth_token', 'Auth Token')] },
  { id: 'postmark', categoryId: 'communication', name: 'Postmark', description: 'Transactional email', website: 'https://postmarkapp.com', authPattern: 'bearer_token', tags: ['email'],
    fields: [secretField('server_api_token', 'Server API Token')] },

  // ── Payment (3) ─────────────────────────────────────────────────────────
  { id: 'stripe', categoryId: 'payment', name: 'Stripe', description: 'Payment processing', website: 'https://stripe.com', authPattern: 'api_key', tags: ['payment'],
    fields: [secretField('secret_key', 'Secret Key', 'sk_live_...'), textField('publishable_key', 'Publishable Key', false, 'pk_live_...'), secretField('webhook_secret', 'Webhook Secret (optional)', 'whsec_...')] },
  { id: 'lemonsqueezy', categoryId: 'payment', name: 'LemonSqueezy', description: 'Digital product payments', website: 'https://lemonsqueezy.com', authPattern: 'api_key', tags: ['payment'],
    fields: [apiKeyField()] },
  { id: 'paddle', categoryId: 'payment', name: 'Paddle', description: 'SaaS billing platform', website: 'https://paddle.com', authPattern: 'api_key', tags: ['payment'],
    fields: [apiKeyField()] },

  // ── Observability (8) ───────────────────────────────────────────────────
  { id: 'sentry', categoryId: 'observability', name: 'Sentry', description: 'Error tracking and APM', website: 'https://sentry.io', authPattern: 'api_key', tags: ['apm', 'errors'],
    fields: [textField('dsn', 'DSN', true, 'https://xxx@xxx.ingest.sentry.io/xxx'), secretField('auth_token', 'Auth Token (optional)', '')] },
  { id: 'datadog', categoryId: 'observability', name: 'Datadog', description: 'Infrastructure monitoring', website: 'https://datadoghq.com', authPattern: 'api_key_secret', tags: ['apm', 'metrics'],
    fields: [apiKeyField(), secretField('app_key', 'App Key')] },
  { id: 'helicone', categoryId: 'observability', name: 'Helicone', description: 'LLM observability proxy', website: 'https://helicone.ai', authPattern: 'api_key', tags: ['llm-ops'],
    fields: [apiKeyField('sk-helicone-...')] },
  { id: 'langsmith', categoryId: 'observability', name: 'LangSmith', description: 'LangChain tracing and eval', website: 'https://smith.langchain.com', authPattern: 'api_key', tags: ['llm-ops'],
    fields: [apiKeyField('lsv2_...')] },
  { id: 'langfuse', categoryId: 'observability', name: 'Langfuse', description: 'Open-source LLM observability', website: 'https://langfuse.com', authPattern: 'api_key_secret', tags: ['llm-ops'],
    fields: [textField('public_key', 'Public Key', true), secretField('secret_key', 'Secret Key'), urlField('host', 'Host', false, 'https://cloud.langfuse.com')] },
  { id: 'portkey', categoryId: 'observability', name: 'Portkey', description: 'AI gateway and observability', website: 'https://portkey.ai', authPattern: 'api_key', tags: ['llm-ops', 'gateway'],
    fields: [apiKeyField()] },
  { id: 'newrelic', categoryId: 'observability', name: 'New Relic', description: 'Full-stack observability', website: 'https://newrelic.com', authPattern: 'api_key', tags: ['apm'],
    fields: [apiKeyField('NRAK-...'), textField('account_id', 'Account ID')] },
  { id: 'grafana', categoryId: 'observability', name: 'Grafana Cloud', description: 'Dashboards and alerts', website: 'https://grafana.com', authPattern: 'api_key', tags: ['metrics', 'dashboards'],
    fields: [apiKeyField(), urlField('instance_url', 'Instance URL', true)] },

  // ── Auth & Identity (4) ─────────────────────────────────────────────────
  { id: 'auth0', categoryId: 'auth_identity', name: 'Auth0', description: 'Identity platform', website: 'https://auth0.com', authPattern: 'oauth2', tags: ['auth'],
    fields: [textField('domain', 'Domain', true, 'xxx.auth0.com'), textField('client_id', 'Client ID', true), secretField('client_secret', 'Client Secret'), secretField('management_api_token', 'Management Token (optional)', '')] },
  { id: 'clerk', categoryId: 'auth_identity', name: 'Clerk', description: 'Authentication and user management', website: 'https://clerk.com', authPattern: 'api_key', tags: ['auth'],
    fields: [secretField('secret_key', 'Secret Key', 'sk_live_...'), textField('publishable_key', 'Publishable Key', false, 'pk_live_...')] },
  { id: 'firebase', categoryId: 'auth_identity', name: 'Firebase', description: 'Auth, Firestore, Cloud Functions', website: 'https://firebase.google.com', authPattern: 'service_account_json', tags: ['baas', 'auth'],
    fields: [{ key: 'service_account_json', label: 'Service Account JSON', type: 'json', required: true, placeholder: '{"type":"service_account",...}', helpText: 'Project Settings > Service accounts' }, textField('project_id', 'Project ID')] },
  { id: 'supabase_auth', categoryId: 'auth_identity', name: 'Supabase Auth', description: 'Auth (shared with Supabase)', website: 'https://supabase.com', authPattern: 'api_key', tags: ['auth'],
    fields: [apiKeyField('eyJ...', 'Shared with Supabase project key'), urlField('project_url', 'Project URL', true)] },

  // ── Object Storage (4) ──────────────────────────────────────────────────
  { id: 'cloudflare_r2', categoryId: 'storage', name: 'Cloudflare R2', description: 'S3-compatible object storage', website: 'https://dash.cloudflare.com', authPattern: 'bearer_token', tags: ['s3'],
    fields: [secretField('api_token', 'API Token'), textField('account_id', 'Account ID', true), textField('bucket', 'Bucket Name')] },
  { id: 'backblaze_b2', categoryId: 'storage', name: 'Backblaze B2', description: 'Affordable cloud storage', website: 'https://backblaze.com', authPattern: 'api_key_secret', tags: ['s3'],
    fields: [textField('application_key_id', 'Application Key ID', true), secretField('application_key', 'Application Key')] },
  { id: 'minio', categoryId: 'storage', name: 'MinIO', description: 'Self-hosted S3-compatible', website: 'https://min.io', authPattern: 'access_key_secret', tags: ['s3', 'self-hosted'],
    fields: [secretField('access_key', 'Access Key'), secretField('secret_key', 'Secret Key'), urlField('endpoint', 'Endpoint', true)] },
  { id: 'arweave', categoryId: 'storage', name: 'Arweave', description: 'Permanent decentralized storage', website: 'https://arweave.org', authPattern: 'service_account_json', tags: ['permanent', 'web3'],
    fields: [{ key: 'wallet_json', label: 'Wallet JWK', type: 'json', required: true, placeholder: '{"kty":"RSA",...}', helpText: 'Arweave wallet JSON Web Key' }] },

  // ── Analytics (4) ───────────────────────────────────────────────────────
  { id: 'posthog', categoryId: 'analytics', name: 'PostHog', description: 'Product analytics + feature flags', website: 'https://posthog.com', authPattern: 'api_key', tags: ['analytics'],
    fields: [apiKeyField('phx_...'), textField('project_id', 'Project ID'), urlField('host', 'Host', false, 'https://app.posthog.com')] },
  { id: 'mixpanel', categoryId: 'analytics', name: 'Mixpanel', description: 'Event analytics', website: 'https://mixpanel.com', authPattern: 'api_key', tags: ['analytics'],
    fields: [textField('project_token', 'Project Token', true), secretField('api_secret', 'API Secret (optional)', '')] },
  { id: 'amplitude', categoryId: 'analytics', name: 'Amplitude', description: 'Product analytics', website: 'https://amplitude.com', authPattern: 'api_key', tags: ['analytics'],
    fields: [apiKeyField(), secretField('secret_key', 'Secret Key (optional)', '')] },
  { id: 'segment', categoryId: 'analytics', name: 'Segment', description: 'Customer Data Platform', website: 'https://segment.com', authPattern: 'api_key', tags: ['cdp'],
    fields: [secretField('write_key', 'Write Key')] },

  // ── Workflow (3) ────────────────────────────────────────────────────────
  { id: 'n8n', categoryId: 'workflow', name: 'n8n', description: 'Workflow automation', website: 'https://n8n.io', authPattern: 'api_key', tags: ['automation'],
    fields: [apiKeyField(), urlField('instance_url', 'Instance URL', true)] },
  { id: 'make', categoryId: 'workflow', name: 'Make (Integromat)', description: 'Visual automation platform', website: 'https://make.com', authPattern: 'bearer_token', tags: ['automation'],
    fields: [secretField('api_token', 'API Token'), textField('org_id', 'Organization ID')] },
  { id: 'zapier', categoryId: 'workflow', name: 'Zapier', description: 'No-code automation', website: 'https://zapier.com', authPattern: 'api_key', tags: ['automation'],
    fields: [apiKeyField('', 'NLA API key')] },

  // ── Container & Compute (3) ─────────────────────────────────────────────
  { id: 'docker_hub', categoryId: 'container_compute', name: 'Docker Hub', description: 'Container registry', website: 'https://hub.docker.com', authPattern: 'bearer_token', tags: ['container'],
    fields: [textField('username', 'Username', true), secretField('personal_access_token', 'Access Token')] },
  { id: 'modal', categoryId: 'container_compute', name: 'Modal', description: 'Serverless GPU compute', website: 'https://modal.com', authPattern: 'api_key_secret', tags: ['gpu', 'serverless'],
    fields: [textField('token_id', 'Token ID', true), secretField('token_secret', 'Token Secret')] },
  { id: 'daytona', categoryId: 'container_compute', name: 'Daytona', description: 'Dev environment management', website: 'https://daytona.io', authPattern: 'api_key', tags: ['devenv'],
    fields: [apiKeyField(), urlField('server_url', 'Server URL', true)] },
];

// ─── ENV Pattern Registry (200+ patterns) ─────────────────────────────────

export const ENV_PATTERNS: EnvPattern[] = [
  // LLM
  { pattern: /^OPENAI_API_KEY$/i, providerId: 'openai', fieldKey: 'api_key' },
  { pattern: /^OPENAI_ORG(?:ANIZATION)?_ID$/i, providerId: 'openai', fieldKey: 'org_id' },
  { pattern: /^OPENAI_PROJECT_ID$/i, providerId: 'openai', fieldKey: 'project_id' },
  { pattern: /^OPENAI_BASE_URL$/i, providerId: 'openai', fieldKey: 'base_url' },
  { pattern: /^ANTHROPIC_API_KEY$/i, providerId: 'anthropic', fieldKey: 'api_key' },
  { pattern: /^GOOGLE_AI_API_KEY$|^GEMINI_API_KEY$/i, providerId: 'google_ai', fieldKey: 'api_key' },
  { pattern: /^XAI_API_KEY$|^GROK_API_KEY$/i, providerId: 'xai', fieldKey: 'api_key' },
  { pattern: /^DEEPSEEK_API_KEY$/i, providerId: 'deepseek', fieldKey: 'api_key' },
  { pattern: /^DASHSCOPE_API_KEY$|^QWEN_API_KEY$/i, providerId: 'qwen', fieldKey: 'api_key' },
  { pattern: /^MISTRAL_API_KEY$/i, providerId: 'mistral', fieldKey: 'api_key' },
  { pattern: /^COHERE_API_KEY$|^CO_API_KEY$/i, providerId: 'cohere', fieldKey: 'api_key' },
  { pattern: /^TOGETHER_API_KEY$/i, providerId: 'together', fieldKey: 'api_key' },
  { pattern: /^FIREWORKS_API_KEY$/i, providerId: 'fireworks', fieldKey: 'api_key' },
  { pattern: /^GROQ_API_KEY$/i, providerId: 'groq', fieldKey: 'api_key' },
  { pattern: /^CEREBRAS_API_KEY$/i, providerId: 'cerebras', fieldKey: 'api_key' },
  { pattern: /^SAMBANOVA_API_KEY$/i, providerId: 'sambanova', fieldKey: 'api_key' },
  { pattern: /^OPENROUTER_API_KEY$/i, providerId: 'openrouter', fieldKey: 'api_key' },
  { pattern: /^AI21_API_KEY$/i, providerId: 'ai21', fieldKey: 'api_key' },
  { pattern: /^PERPLEXITY_API_KEY$|^PPLX_API_KEY$/i, providerId: 'perplexity', fieldKey: 'api_key' },

  // Image/Video
  { pattern: /^STABILITY_API_KEY$/i, providerId: 'stability', fieldKey: 'api_key' },
  { pattern: /^REPLICATE_API_TOKEN$/i, providerId: 'replicate', fieldKey: 'api_token' },
  { pattern: /^RUNWAY_API_KEY$/i, providerId: 'runway', fieldKey: 'api_key' },
  { pattern: /^HEYGEN_API_KEY$/i, providerId: 'heygen', fieldKey: 'api_key' },
  { pattern: /^ELEVENLABS_API_KEY$/i, providerId: 'elevenlabs', fieldKey: 'api_key' },
  { pattern: /^FAL_KEY$|^FAL_API_KEY$/i, providerId: 'fal', fieldKey: 'api_key' },
  { pattern: /^LIBTV_ACCESS_KEY$/i, providerId: 'libtv', fieldKey: 'access_key' },

  // Embedding/Vector
  { pattern: /^PINECONE_API_KEY$/i, providerId: 'pinecone', fieldKey: 'api_key' },
  { pattern: /^PINECONE_ENVIRONMENT$/i, providerId: 'pinecone', fieldKey: 'environment' },
  { pattern: /^WEAVIATE_API_KEY$/i, providerId: 'weaviate', fieldKey: 'api_key' },
  { pattern: /^WEAVIATE_URL$/i, providerId: 'weaviate', fieldKey: 'cluster_url' },
  { pattern: /^QDRANT_API_KEY$/i, providerId: 'qdrant', fieldKey: 'api_key' },
  { pattern: /^QDRANT_URL$/i, providerId: 'qdrant', fieldKey: 'cluster_url' },
  { pattern: /^VOYAGE_API_KEY$/i, providerId: 'voyage', fieldKey: 'api_key' },
  { pattern: /^JINA_API_KEY$/i, providerId: 'jina', fieldKey: 'api_key' },

  // Search
  { pattern: /^BRAVE_SEARCH_API_KEY$|^BRAVE_API_KEY$/i, providerId: 'brave_search', fieldKey: 'api_key' },
  { pattern: /^SERPAPI_API_KEY$|^SERP_API_KEY$/i, providerId: 'serpapi', fieldKey: 'api_key' },
  { pattern: /^TAVILY_API_KEY$/i, providerId: 'tavily', fieldKey: 'api_key' },
  { pattern: /^EXA_API_KEY$/i, providerId: 'exa', fieldKey: 'api_key' },
  { pattern: /^BING_SEARCH_API_KEY$/i, providerId: 'bing_search', fieldKey: 'api_key' },
  { pattern: /^GOOGLE_CSE_API_KEY$|^GOOGLE_SEARCH_API_KEY$/i, providerId: 'google_search', fieldKey: 'api_key' },
  { pattern: /^GOOGLE_CSE_CX$|^GOOGLE_SEARCH_CX$/i, providerId: 'google_search', fieldKey: 'cx' },

  // Cloud Infrastructure
  { pattern: /^AWS_ACCESS_KEY_ID$/i, providerId: 'aws', fieldKey: 'access_key_id' },
  { pattern: /^AWS_SECRET_ACCESS_KEY$/i, providerId: 'aws', fieldKey: 'secret_access_key' },
  { pattern: /^AWS_DEFAULT_REGION$|^AWS_REGION$/i, providerId: 'aws', fieldKey: 'region' },
  { pattern: /^AWS_SESSION_TOKEN$/i, providerId: 'aws', fieldKey: 'session_token' },
  { pattern: /^GOOGLE_APPLICATION_CREDENTIALS$/i, providerId: 'gcp', fieldKey: 'service_account_json' },
  { pattern: /^GCP_PROJECT_ID$|^GCLOUD_PROJECT$/i, providerId: 'gcp', fieldKey: 'project_id' },
  { pattern: /^AZURE_TENANT_ID$/i, providerId: 'azure', fieldKey: 'tenant_id' },
  { pattern: /^AZURE_CLIENT_ID$/i, providerId: 'azure', fieldKey: 'client_id' },
  { pattern: /^AZURE_CLIENT_SECRET$/i, providerId: 'azure', fieldKey: 'client_secret' },
  { pattern: /^AZURE_SUBSCRIPTION_ID$/i, providerId: 'azure', fieldKey: 'subscription_id' },
  { pattern: /^CLOUDFLARE_API_TOKEN$/i, providerId: 'cloudflare', fieldKey: 'api_token' },
  { pattern: /^CLOUDFLARE_ACCOUNT_ID$|^CF_ACCOUNT_ID$/i, providerId: 'cloudflare', fieldKey: 'account_id' },
  { pattern: /^VERCEL_TOKEN$|^VERCEL_API_TOKEN$/i, providerId: 'vercel', fieldKey: 'api_token' },
  { pattern: /^VERCEL_TEAM_ID$/i, providerId: 'vercel', fieldKey: 'team_id' },
  { pattern: /^NETLIFY_AUTH_TOKEN$/i, providerId: 'netlify', fieldKey: 'api_token' },
  { pattern: /^RAILWAY_TOKEN$/i, providerId: 'railway', fieldKey: 'api_token' },
  { pattern: /^FLY_API_TOKEN$/i, providerId: 'flyio', fieldKey: 'api_token' },
  { pattern: /^DIGITALOCEAN_TOKEN$|^DO_API_TOKEN$/i, providerId: 'digitalocean', fieldKey: 'api_token' },

  // Code & Dev Tools
  { pattern: /^GITHUB_TOKEN$|^GH_TOKEN$|^GITHUB_PAT$/i, providerId: 'github', fieldKey: 'personal_access_token' },
  { pattern: /^GITLAB_TOKEN$|^GITLAB_PAT$/i, providerId: 'gitlab', fieldKey: 'personal_access_token' },
  { pattern: /^SUPABASE_KEY$|^SUPABASE_ANON_KEY$|^NEXT_PUBLIC_SUPABASE_ANON_KEY$/i, providerId: 'supabase', fieldKey: 'api_key' },
  { pattern: /^SUPABASE_SERVICE_ROLE_KEY$/i, providerId: 'supabase', fieldKey: 'service_role_key' },
  { pattern: /^SUPABASE_URL$|^NEXT_PUBLIC_SUPABASE_URL$/i, providerId: 'supabase', fieldKey: 'project_url' },
  { pattern: /^NEON_API_KEY$/i, providerId: 'neon', fieldKey: 'api_key' },
  { pattern: /^TURSO_AUTH_TOKEN$/i, providerId: 'turso', fieldKey: 'api_token' },
  { pattern: /^TURSO_DATABASE_URL$/i, providerId: 'turso', fieldKey: 'database_url' },
  { pattern: /^UPSTASH_REDIS_REST_TOKEN$/i, providerId: 'upstash', fieldKey: 'api_key' },
  { pattern: /^UPSTASH_REDIS_REST_URL$/i, providerId: 'upstash', fieldKey: 'rest_url' },

  // Communication
  { pattern: /^TELEGRAM_BOT_TOKEN$|^TG_BOT_TOKEN$/i, providerId: 'telegram', fieldKey: 'bot_token' },
  { pattern: /^DISCORD_BOT_TOKEN$|^DISCORD_TOKEN$/i, providerId: 'discord', fieldKey: 'bot_token' },
  { pattern: /^SLACK_BOT_TOKEN$/i, providerId: 'slack', fieldKey: 'bot_token' },
  { pattern: /^SLACK_SIGNING_SECRET$/i, providerId: 'slack', fieldKey: 'signing_secret' },
  { pattern: /^SENDGRID_API_KEY$/i, providerId: 'sendgrid', fieldKey: 'api_key' },
  { pattern: /^RESEND_API_KEY$/i, providerId: 'resend', fieldKey: 'api_key' },
  { pattern: /^TWILIO_ACCOUNT_SID$/i, providerId: 'twilio', fieldKey: 'account_sid' },
  { pattern: /^TWILIO_AUTH_TOKEN$/i, providerId: 'twilio', fieldKey: 'auth_token' },

  // Payment
  { pattern: /^STRIPE_SECRET_KEY$/i, providerId: 'stripe', fieldKey: 'secret_key' },
  { pattern: /^STRIPE_PUBLISHABLE_KEY$|^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY$/i, providerId: 'stripe', fieldKey: 'publishable_key' },
  { pattern: /^STRIPE_WEBHOOK_SECRET$/i, providerId: 'stripe', fieldKey: 'webhook_secret' },

  // Observability
  { pattern: /^SENTRY_DSN$|^NEXT_PUBLIC_SENTRY_DSN$/i, providerId: 'sentry', fieldKey: 'dsn' },
  { pattern: /^SENTRY_AUTH_TOKEN$/i, providerId: 'sentry', fieldKey: 'auth_token' },
  { pattern: /^DD_API_KEY$|^DATADOG_API_KEY$/i, providerId: 'datadog', fieldKey: 'api_key' },
  { pattern: /^DD_APP_KEY$|^DATADOG_APP_KEY$/i, providerId: 'datadog', fieldKey: 'app_key' },
  { pattern: /^HELICONE_API_KEY$/i, providerId: 'helicone', fieldKey: 'api_key' },
  { pattern: /^LANGCHAIN_API_KEY$|^LANGSMITH_API_KEY$/i, providerId: 'langsmith', fieldKey: 'api_key' },
  { pattern: /^LANGFUSE_PUBLIC_KEY$/i, providerId: 'langfuse', fieldKey: 'public_key' },
  { pattern: /^LANGFUSE_SECRET_KEY$/i, providerId: 'langfuse', fieldKey: 'secret_key' },
  { pattern: /^LANGFUSE_HOST$/i, providerId: 'langfuse', fieldKey: 'host' },
  { pattern: /^PORTKEY_API_KEY$/i, providerId: 'portkey', fieldKey: 'api_key' },
  { pattern: /^NEW_RELIC_LICENSE_KEY$|^NEW_RELIC_API_KEY$/i, providerId: 'newrelic', fieldKey: 'api_key' },

  // Auth
  { pattern: /^AUTH0_DOMAIN$/i, providerId: 'auth0', fieldKey: 'domain' },
  { pattern: /^AUTH0_CLIENT_ID$/i, providerId: 'auth0', fieldKey: 'client_id' },
  { pattern: /^AUTH0_CLIENT_SECRET$/i, providerId: 'auth0', fieldKey: 'client_secret' },
  { pattern: /^CLERK_SECRET_KEY$/i, providerId: 'clerk', fieldKey: 'secret_key' },
  { pattern: /^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY$/i, providerId: 'clerk', fieldKey: 'publishable_key' },

  // Storage
  { pattern: /^R2_ACCESS_KEY_ID$/i, providerId: 'cloudflare_r2', fieldKey: 'api_token' },
  { pattern: /^B2_APPLICATION_KEY_ID$/i, providerId: 'backblaze_b2', fieldKey: 'application_key_id' },
  { pattern: /^B2_APPLICATION_KEY$/i, providerId: 'backblaze_b2', fieldKey: 'application_key' },

  // Analytics
  { pattern: /^NEXT_PUBLIC_POSTHOG_KEY$|^POSTHOG_API_KEY$/i, providerId: 'posthog', fieldKey: 'api_key' },
  { pattern: /^POSTHOG_HOST$/i, providerId: 'posthog', fieldKey: 'host' },
  { pattern: /^MIXPANEL_TOKEN$|^MIXPANEL_PROJECT_TOKEN$/i, providerId: 'mixpanel', fieldKey: 'project_token' },
  { pattern: /^AMPLITUDE_API_KEY$/i, providerId: 'amplitude', fieldKey: 'api_key' },
  { pattern: /^SEGMENT_WRITE_KEY$/i, providerId: 'segment', fieldKey: 'write_key' },

  // Workflow
  { pattern: /^N8N_API_KEY$/i, providerId: 'n8n', fieldKey: 'api_key' },

  // Container
  { pattern: /^DOCKER_HUB_TOKEN$|^DOCKERHUB_TOKEN$/i, providerId: 'docker_hub', fieldKey: 'personal_access_token' },
  { pattern: /^MODAL_TOKEN_ID$/i, providerId: 'modal', fieldKey: 'token_id' },
  { pattern: /^MODAL_TOKEN_SECRET$/i, providerId: 'modal', fieldKey: 'token_secret' },
];

// ─── Lookup Helpers ───────────────────────────────────────────────────────

const _providerMap = new Map(PROVIDER_TEMPLATES.map(p => [p.id, p]));
const _categoryMap = new Map(CREDENTIAL_CATEGORIES.map(c => [c.id, c]));

export function getProvider(id: string): ProviderTemplate | undefined {
  return _providerMap.get(id);
}

export function getCategory(id: string): CredentialCategory | undefined {
  return _categoryMap.get(id);
}

export function getProvidersByCategory(categoryId: string): ProviderTemplate[] {
  return PROVIDER_TEMPLATES.filter(p => p.categoryId === categoryId);
}

export function matchEnvVar(envName: string): { providerId: string; fieldKey: string } | null {
  for (const { pattern, providerId, fieldKey } of ENV_PATTERNS) {
    if (pattern.test(envName)) {
      return { providerId, fieldKey };
    }
  }
  return null;
}
