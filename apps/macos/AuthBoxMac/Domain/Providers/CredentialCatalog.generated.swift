//
//  CredentialCatalog.generated.swift
//  GENERATED FILE — DO NOT EDIT BY HAND.
//
//  Source:     packages/shared/src/types/credential-catalog.ts
//  sha256:     2007f208c17e949e38a972dc42e138c43395e27f58e474b58ede29d8a995a91e
//  Regenerate: pnpm run gen:swift-catalog
//  CI gate:    pnpm run gen:swift-catalog --check  (fails if this file is stale)
//
//  15 categories · 91 providers · 108 env patterns.
//

import Foundation

enum AuthPattern: String, Codable, Hashable {
    case api_key, api_key_secret, bearer_token, oauth2
    case service_account_json, access_key_secret, bot_token
}

enum FieldType: String, Codable, Hashable {
    case secret, text, url, json, file
}

struct CredentialField: Identifiable, Hashable {
    let key: String
    let label: String
    let type: FieldType
    let required: Bool
    let placeholder: String
    let helpText: String
    var id: String { key }
}

struct CredentialCategory: Identifiable, Hashable {
    let id: String
    let name: String
    let description: String
    let icon: String
    let sortOrder: Int
}

struct ProviderTemplate: Identifiable, Hashable {
    let id: String
    let categoryId: String
    let name: String
    let description: String
    let website: String
    let authPattern: AuthPattern
    let tags: [String]
    let fields: [CredentialField]
}

/// One env-var-name → provider/field mapping. `pattern` is an
/// NSRegularExpression source applied case-insensitively.
struct EnvPattern {
    let pattern: String
    let providerId: String
    let fieldKey: String
}

enum CredentialCatalog {
    static let categories: [CredentialCategory] = [
        CredentialCategory(id: "llm", name: "LLM", description: "Large language model inference APIs", icon: "Brain", sortOrder: 1),
        CredentialCategory(id: "image_video", name: "Image/Video", description: "Visual content generation and editing", icon: "Image", sortOrder: 2),
        CredentialCategory(id: "embedding_vector", name: "Embedding & Vector", description: "Embedding models and vector storage", icon: "Database", sortOrder: 3),
        CredentialCategory(id: "search_web", name: "Search & Web", description: "Web search and content extraction", icon: "Search", sortOrder: 4),
        CredentialCategory(id: "cloud_infra", name: "Cloud Infrastructure", description: "IaaS/PaaS provider credentials", icon: "Cloud", sortOrder: 5),
        CredentialCategory(id: "code_dev", name: "Code & Dev Tools", description: "Source control, databases, caches", icon: "Code", sortOrder: 6),
        CredentialCategory(id: "communication", name: "Communication", description: "Messaging bots, email, SMS", icon: "MessageSquare", sortOrder: 7),
        CredentialCategory(id: "payment", name: "Payment", description: "Payment processing and billing", icon: "CreditCard", sortOrder: 8),
        CredentialCategory(id: "observability", name: "Observability", description: "APM, logging, LLM tracing", icon: "Activity", sortOrder: 9),
        CredentialCategory(id: "auth_identity", name: "Auth & Identity", description: "Identity providers and SSO", icon: "Shield", sortOrder: 10),
        CredentialCategory(id: "storage", name: "Object Storage", description: "File and blob storage services", icon: "HardDrive", sortOrder: 11),
        CredentialCategory(id: "analytics", name: "Analytics", description: "Product analytics and CDP", icon: "BarChart", sortOrder: 12),
        CredentialCategory(id: "workflow", name: "Workflow", description: "iPaaS and workflow orchestration", icon: "GitBranch", sortOrder: 13),
        CredentialCategory(id: "domain_dns", name: "Domain & DNS", description: "Domain registration and DNS management", icon: "Globe", sortOrder: 14),
        CredentialCategory(id: "container_compute", name: "Container & Compute", description: "Container registries and serverless compute", icon: "Box", sortOrder: 15),
    ]

    static let providers: [ProviderTemplate] = [
        ProviderTemplate(id: "openai", categoryId: "llm", name: "OpenAI", description: "GPT-4o, o3, DALL-E, Whisper, Embeddings", website: "https://platform.openai.com", authPattern: .api_key, tags: ["tier-1", "chat", "embedding", "image", "audio"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "platform.openai.com/api-keys"),
            CredentialField(key: "org_id", label: "Organization ID", type: .text, required: false, placeholder: "org-...", helpText: ""),
            CredentialField(key: "project_id", label: "Project ID", type: .text, required: false, placeholder: "", helpText: ""),
            CredentialField(key: "base_url", label: "Base URL", type: .url, required: false, placeholder: "https://api.openai.com/v1", helpText: ""),
        ]),
        ProviderTemplate(id: "anthropic", categoryId: "llm", name: "Anthropic", description: "Claude Opus, Sonnet, Haiku", website: "https://console.anthropic.com", authPattern: .api_key, tags: ["tier-1", "chat"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-ant-...", helpText: "console.anthropic.com/settings/keys"),
        ]),
        ProviderTemplate(id: "google_ai", categoryId: "llm", name: "Google AI", description: "Gemini 2.5 Pro/Flash, Imagen, Embedding", website: "https://aistudio.google.com", authPattern: .api_key, tags: ["tier-1", "chat", "embedding", "image"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "AIza...", helpText: "aistudio.google.com/apikey"),
        ]),
        ProviderTemplate(id: "xai", categoryId: "llm", name: "xAI", description: "Grok 3, Grok 3 Mini", website: "https://console.x.ai", authPattern: .api_key, tags: ["tier-1", "chat", "search"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "xai-...", helpText: "console.x.ai/team/api-keys"),
        ]),
        ProviderTemplate(id: "deepseek", categoryId: "llm", name: "DeepSeek", description: "DeepSeek V4, R2", website: "https://platform.deepseek.com", authPattern: .api_key, tags: ["tier-2", "chat", "code"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "platform.deepseek.com/api_keys"),
        ]),
        ProviderTemplate(id: "qwen", categoryId: "llm", name: "Qwen (Alibaba)", description: "Qwen 3 235B, Qwen-VL", website: "https://dashscope.console.aliyun.com", authPattern: .api_key, tags: ["tier-2", "chat", "vision"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "DashScope console"),
        ]),
        ProviderTemplate(id: "mistral", categoryId: "llm", name: "Mistral", description: "Mistral Large, Codestral", website: "https://console.mistral.ai", authPattern: .api_key, tags: ["tier-2", "chat", "code"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "cohere", categoryId: "llm", name: "Cohere", description: "Command R+, Embed, Rerank", website: "https://dashboard.cohere.com", authPattern: .api_key, tags: ["tier-2", "chat", "embedding", "rerank"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "together", categoryId: "llm", name: "Together AI", description: "Open-source model hosting", website: "https://api.together.xyz", authPattern: .api_key, tags: ["aggregator", "chat"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "fireworks", categoryId: "llm", name: "Fireworks AI", description: "Fast inference for open models", website: "https://fireworks.ai", authPattern: .api_key, tags: ["aggregator", "chat"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "groq", categoryId: "llm", name: "Groq", description: "Ultra-fast LPU inference", website: "https://console.groq.com", authPattern: .api_key, tags: ["aggregator", "chat", "fast"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "gsk_...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "cerebras", categoryId: "llm", name: "Cerebras", description: "Wafer-scale inference", website: "https://cloud.cerebras.ai", authPattern: .api_key, tags: ["aggregator", "chat", "fast"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "sambanova", categoryId: "llm", name: "SambaNova", description: "DataScale inference", website: "https://cloud.sambanova.ai", authPattern: .api_key, tags: ["aggregator", "chat"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "openrouter", categoryId: "llm", name: "OpenRouter", description: "Multi-model aggregator", website: "https://openrouter.ai", authPattern: .api_key, tags: ["aggregator", "chat"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-or-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "ai21", categoryId: "llm", name: "AI21 Labs", description: "Jamba models", website: "https://studio.ai21.com", authPattern: .api_key, tags: ["tier-2", "chat"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "stability", categoryId: "image_video", name: "Stability AI", description: "Stable Diffusion, SDXL", website: "https://platform.stability.ai", authPattern: .api_key, tags: ["image"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "replicate", categoryId: "image_video", name: "Replicate", description: "Open-source model hosting", website: "https://replicate.com", authPattern: .bearer_token, tags: ["image", "video", "audio"], fields: [
            CredentialField(key: "api_token", label: "API Token", type: .secret, required: true, placeholder: "r8_...", helpText: "replicate.com/account/api-tokens"),
        ]),
        ProviderTemplate(id: "runway", categoryId: "image_video", name: "RunwayML", description: "Gen-3 Alpha video generation", website: "https://runwayml.com", authPattern: .api_key, tags: ["video"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "heygen", categoryId: "image_video", name: "HeyGen", description: "AI avatar videos, TTS, translation", website: "https://heygen.com", authPattern: .api_key, tags: ["video", "avatar", "tts"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "", helpText: "app.heygen.com/settings"),
        ]),
        ProviderTemplate(id: "pika", categoryId: "image_video", name: "Pika", description: "AI video generation", website: "https://pika.art", authPattern: .api_key, tags: ["video"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "kling", categoryId: "image_video", name: "Kling (Kuaishou)", description: "Kling 3.0 video generation", website: "https://klingai.com", authPattern: .api_key_secret, tags: ["video"], fields: [
            CredentialField(key: "access_key", label: "Access Key", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "secret_key", label: "Secret Key", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "luma", categoryId: "image_video", name: "Luma AI", description: "Dream Machine video", website: "https://lumalabs.ai", authPattern: .api_key, tags: ["video", "3d"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "elevenlabs", categoryId: "image_video", name: "ElevenLabs", description: "Voice synthesis and cloning", website: "https://elevenlabs.io", authPattern: .api_key, tags: ["audio", "tts", "voice"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "", helpText: "elevenlabs.io/app/settings/api-keys"),
        ]),
        ProviderTemplate(id: "fal", categoryId: "image_video", name: "Fal.ai", description: "Fast image/video inference", website: "https://fal.ai", authPattern: .api_key, tags: ["image", "video"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "libtv", categoryId: "image_video", name: "LibTV (liblib.tv)", description: "Seedance 2.0, AI video/image", website: "https://liblib.tv", authPattern: .api_key, tags: ["image", "video"], fields: [
            CredentialField(key: "access_key", label: "Access Key", type: .secret, required: true, placeholder: "", helpText: "LibTV dashboard"),
        ]),
        ProviderTemplate(id: "pinecone", categoryId: "embedding_vector", name: "Pinecone", description: "Managed vector database", website: "https://pinecone.io", authPattern: .api_key, tags: ["vector"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "environment", label: "Environment", type: .text, required: false, placeholder: "us-east-1-aws", helpText: ""),
        ]),
        ProviderTemplate(id: "weaviate", categoryId: "embedding_vector", name: "Weaviate Cloud", description: "Vector search engine", website: "https://weaviate.io", authPattern: .api_key, tags: ["vector"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "cluster_url", label: "Cluster URL", type: .url, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "qdrant", categoryId: "embedding_vector", name: "Qdrant Cloud", description: "Vector similarity search", website: "https://qdrant.io", authPattern: .api_key, tags: ["vector"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "cluster_url", label: "Cluster URL", type: .url, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "milvus", categoryId: "embedding_vector", name: "Zilliz (Milvus)", description: "Managed Milvus", website: "https://zilliz.com", authPattern: .api_key, tags: ["vector"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "endpoint", label: "Endpoint", type: .url, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "voyage", categoryId: "embedding_vector", name: "Voyage AI", description: "Embedding models", website: "https://voyageai.com", authPattern: .api_key, tags: ["embedding"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "jina", categoryId: "embedding_vector", name: "Jina AI", description: "Embeddings, reranking, reader", website: "https://jina.ai", authPattern: .api_key, tags: ["embedding", "rerank"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "jina_...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "chroma", categoryId: "embedding_vector", name: "Chroma Cloud", description: "AI-native embedding database", website: "https://trychroma.com", authPattern: .api_key, tags: ["vector"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "tenant_id", label: "Tenant ID", type: .text, required: false, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "brave_search", categoryId: "search_web", name: "Brave Search", description: "Independent search API", website: "https://brave.com/search/api", authPattern: .api_key, tags: ["search"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "BSA...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "serpapi", categoryId: "search_web", name: "SerpAPI", description: "Google/Bing search scraping", website: "https://serpapi.com", authPattern: .api_key, tags: ["search"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "tavily", categoryId: "search_web", name: "Tavily", description: "AI-optimized search", website: "https://tavily.com", authPattern: .api_key, tags: ["search", "agent"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "tvly-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "exa", categoryId: "search_web", name: "Exa", description: "Neural search engine", website: "https://exa.ai", authPattern: .api_key, tags: ["search", "agent"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "bing_search", categoryId: "search_web", name: "Bing Search (Azure)", description: "Microsoft Bing Web Search", website: "https://azure.microsoft.com", authPattern: .api_key, tags: ["search"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "endpoint", label: "Endpoint", type: .url, required: false, placeholder: "https://api.bing.microsoft.com", helpText: ""),
        ]),
        ProviderTemplate(id: "google_search", categoryId: "search_web", name: "Google Custom Search", description: "Programmable Search Engine", website: "https://developers.google.com/custom-search", authPattern: .api_key, tags: ["search"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "cx", label: "Search Engine ID", type: .text, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "perplexity", categoryId: "search_web", name: "Perplexity", description: "AI search with citations", website: "https://perplexity.ai", authPattern: .api_key, tags: ["search", "chat"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "pplx-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "aws", categoryId: "cloud_infra", name: "AWS", description: "Amazon Web Services", website: "https://aws.amazon.com", authPattern: .access_key_secret, tags: ["iaas", "s3", "lambda", "bedrock"], fields: [
            CredentialField(key: "access_key_id", label: "Access Key ID", type: .secret, required: true, placeholder: "AKIA...", helpText: ""),
            CredentialField(key: "secret_access_key", label: "Secret Access Key", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "region", label: "Region", type: .text, required: false, placeholder: "us-east-1", helpText: ""),
            CredentialField(key: "session_token", label: "Session Token (optional)", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "gcp", categoryId: "cloud_infra", name: "Google Cloud", description: "GCP / Vertex AI", website: "https://console.cloud.google.com", authPattern: .service_account_json, tags: ["iaas", "vertex"], fields: [
            CredentialField(key: "service_account_json", label: "Service Account JSON", type: .json, required: true, placeholder: "{\"type\":\"service_account\",...}", helpText: "IAM > Service Accounts > Keys > JSON"),
            CredentialField(key: "project_id", label: "Project ID", type: .text, required: false, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "azure", categoryId: "cloud_infra", name: "Azure", description: "Microsoft Azure / Azure OpenAI", website: "https://portal.azure.com", authPattern: .oauth2, tags: ["iaas", "azure_openai"], fields: [
            CredentialField(key: "tenant_id", label: "Tenant ID", type: .text, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "client_id", label: "Client ID", type: .text, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "client_secret", label: "Client Secret", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "subscription_id", label: "Subscription ID", type: .text, required: false, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "cloudflare", categoryId: "cloud_infra", name: "Cloudflare", description: "Workers, R2, D1, Pages", website: "https://dash.cloudflare.com", authPattern: .bearer_token, tags: ["edge", "cdn", "workers"], fields: [
            CredentialField(key: "api_token", label: "API Token", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "account_id", label: "Account ID", type: .text, required: false, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "vercel", categoryId: "cloud_infra", name: "Vercel", description: "Frontend deployment platform", website: "https://vercel.com", authPattern: .bearer_token, tags: ["paas", "frontend"], fields: [
            CredentialField(key: "api_token", label: "API Token", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "team_id", label: "Team ID", type: .text, required: false, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "netlify", categoryId: "cloud_infra", name: "Netlify", description: "Web deployment platform", website: "https://netlify.com", authPattern: .bearer_token, tags: ["paas", "frontend"], fields: [
            CredentialField(key: "api_token", label: "API Token", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "railway", categoryId: "cloud_infra", name: "Railway", description: "Cloud deployment platform", website: "https://railway.app", authPattern: .bearer_token, tags: ["paas"], fields: [
            CredentialField(key: "api_token", label: "API Token", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "flyio", categoryId: "cloud_infra", name: "Fly.io", description: "Edge compute platform", website: "https://fly.io", authPattern: .bearer_token, tags: ["paas", "edge"], fields: [
            CredentialField(key: "api_token", label: "API Token", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "org_slug", label: "Org Slug", type: .text, required: false, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "digitalocean", categoryId: "cloud_infra", name: "DigitalOcean", description: "Cloud infrastructure", website: "https://digitalocean.com", authPattern: .bearer_token, tags: ["iaas"], fields: [
            CredentialField(key: "api_token", label: "API Token", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "github", categoryId: "code_dev", name: "GitHub", description: "Source control, Actions, Packages", website: "https://github.com", authPattern: .bearer_token, tags: ["git", "ci"], fields: [
            CredentialField(key: "personal_access_token", label: "Personal Access Token", type: .secret, required: true, placeholder: "ghp_...", helpText: "Settings > Developer settings > PAT"),
            CredentialField(key: "org", label: "Organization", type: .text, required: false, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "gitlab", categoryId: "code_dev", name: "GitLab", description: "DevOps platform", website: "https://gitlab.com", authPattern: .bearer_token, tags: ["git", "ci"], fields: [
            CredentialField(key: "personal_access_token", label: "Access Token", type: .secret, required: true, placeholder: "glpat-...", helpText: ""),
            CredentialField(key: "instance_url", label: "Instance URL", type: .url, required: false, placeholder: "https://gitlab.com", helpText: ""),
        ]),
        ProviderTemplate(id: "supabase", categoryId: "code_dev", name: "Supabase", description: "PostgreSQL, Auth, Storage, Realtime", website: "https://supabase.com", authPattern: .api_key, tags: ["baas", "db", "auth"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "eyJ...", helpText: "anon key"),
            CredentialField(key: "service_role_key", label: "Service Role Key", type: .secret, required: true, placeholder: "eyJ...", helpText: ""),
            CredentialField(key: "project_url", label: "Project URL", type: .url, required: true, placeholder: "https://xxx.supabase.co", helpText: ""),
        ]),
        ProviderTemplate(id: "neon", categoryId: "code_dev", name: "Neon", description: "Serverless Postgres", website: "https://neon.tech", authPattern: .api_key, tags: ["db", "postgres"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "connection_string", label: "Connection String", type: .url, required: false, placeholder: "postgres://...", helpText: ""),
        ]),
        ProviderTemplate(id: "turso", categoryId: "code_dev", name: "Turso", description: "Edge SQLite (libSQL)", website: "https://turso.tech", authPattern: .bearer_token, tags: ["db", "sqlite"], fields: [
            CredentialField(key: "api_token", label: "API Token", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "database_url", label: "Database URL", type: .url, required: false, placeholder: "libsql://...", helpText: ""),
        ]),
        ProviderTemplate(id: "upstash", categoryId: "code_dev", name: "Upstash", description: "Serverless Redis + Kafka", website: "https://upstash.com", authPattern: .api_key, tags: ["cache", "redis"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "rest_url", label: "REST URL", type: .url, required: true, placeholder: "https://xxx.upstash.io", helpText: ""),
        ]),
        ProviderTemplate(id: "planetscale", categoryId: "code_dev", name: "PlanetScale", description: "Serverless MySQL", website: "https://planetscale.com", authPattern: .api_key_secret, tags: ["db", "mysql"], fields: [
            CredentialField(key: "service_token_id", label: "Service Token ID", type: .text, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "service_token", label: "Service Token", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "telegram", categoryId: "communication", name: "Telegram Bot", description: "Bot API for messaging", website: "https://core.telegram.org/bots/api", authPattern: .bot_token, tags: ["bot", "im"], fields: [
            CredentialField(key: "bot_token", label: "Bot Token", type: .secret, required: true, placeholder: "123456:ABC-...", helpText: "@BotFather"),
        ]),
        ProviderTemplate(id: "discord", categoryId: "communication", name: "Discord Bot", description: "Bot for Discord servers", website: "https://discord.com/developers", authPattern: .bot_token, tags: ["bot", "im"], fields: [
            CredentialField(key: "bot_token", label: "Bot Token", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "client_id", label: "Client ID", type: .text, required: false, placeholder: "", helpText: ""),
            CredentialField(key: "client_secret", label: "Client Secret", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "slack", categoryId: "communication", name: "Slack Bot", description: "Workspace bot and apps", website: "https://api.slack.com", authPattern: .bot_token, tags: ["bot", "im"], fields: [
            CredentialField(key: "bot_token", label: "Bot Token", type: .secret, required: true, placeholder: "xoxb-...", helpText: ""),
            CredentialField(key: "signing_secret", label: "Signing Secret", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "app_token", label: "App Token (optional)", type: .secret, required: true, placeholder: "xapp-...", helpText: ""),
        ]),
        ProviderTemplate(id: "sendgrid", categoryId: "communication", name: "SendGrid", description: "Email delivery API", website: "https://sendgrid.com", authPattern: .api_key, tags: ["email"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "SG..", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "resend", categoryId: "communication", name: "Resend", description: "Modern email API", website: "https://resend.com", authPattern: .api_key, tags: ["email"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "re_...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "twilio", categoryId: "communication", name: "Twilio", description: "SMS, voice, WhatsApp", website: "https://twilio.com", authPattern: .api_key_secret, tags: ["sms", "voice"], fields: [
            CredentialField(key: "account_sid", label: "Account SID", type: .text, required: true, placeholder: "AC...", helpText: ""),
            CredentialField(key: "auth_token", label: "Auth Token", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "postmark", categoryId: "communication", name: "Postmark", description: "Transactional email", website: "https://postmarkapp.com", authPattern: .bearer_token, tags: ["email"], fields: [
            CredentialField(key: "server_api_token", label: "Server API Token", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "stripe", categoryId: "payment", name: "Stripe", description: "Payment processing", website: "https://stripe.com", authPattern: .api_key, tags: ["payment"], fields: [
            CredentialField(key: "secret_key", label: "Secret Key", type: .secret, required: true, placeholder: "sk_live_...", helpText: ""),
            CredentialField(key: "publishable_key", label: "Publishable Key", type: .text, required: false, placeholder: "pk_live_...", helpText: ""),
            CredentialField(key: "webhook_secret", label: "Webhook Secret (optional)", type: .secret, required: true, placeholder: "whsec_...", helpText: ""),
        ]),
        ProviderTemplate(id: "lemonsqueezy", categoryId: "payment", name: "LemonSqueezy", description: "Digital product payments", website: "https://lemonsqueezy.com", authPattern: .api_key, tags: ["payment"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "paddle", categoryId: "payment", name: "Paddle", description: "SaaS billing platform", website: "https://paddle.com", authPattern: .api_key, tags: ["payment"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "sentry", categoryId: "observability", name: "Sentry", description: "Error tracking and APM", website: "https://sentry.io", authPattern: .api_key, tags: ["apm", "errors"], fields: [
            CredentialField(key: "dsn", label: "DSN", type: .text, required: true, placeholder: "https://xxx@xxx.ingest.sentry.io/xxx", helpText: ""),
            CredentialField(key: "auth_token", label: "Auth Token (optional)", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "datadog", categoryId: "observability", name: "Datadog", description: "Infrastructure monitoring", website: "https://datadoghq.com", authPattern: .api_key_secret, tags: ["apm", "metrics"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "app_key", label: "App Key", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "helicone", categoryId: "observability", name: "Helicone", description: "LLM observability proxy", website: "https://helicone.ai", authPattern: .api_key, tags: ["llm-ops"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-helicone-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "langsmith", categoryId: "observability", name: "LangSmith", description: "LangChain tracing and eval", website: "https://smith.langchain.com", authPattern: .api_key, tags: ["llm-ops"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "lsv2_...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "langfuse", categoryId: "observability", name: "Langfuse", description: "Open-source LLM observability", website: "https://langfuse.com", authPattern: .api_key_secret, tags: ["llm-ops"], fields: [
            CredentialField(key: "public_key", label: "Public Key", type: .text, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "secret_key", label: "Secret Key", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "host", label: "Host", type: .url, required: false, placeholder: "https://cloud.langfuse.com", helpText: ""),
        ]),
        ProviderTemplate(id: "portkey", categoryId: "observability", name: "Portkey", description: "AI gateway and observability", website: "https://portkey.ai", authPattern: .api_key, tags: ["llm-ops", "gateway"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
        ]),
        ProviderTemplate(id: "newrelic", categoryId: "observability", name: "New Relic", description: "Full-stack observability", website: "https://newrelic.com", authPattern: .api_key, tags: ["apm"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "NRAK-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "account_id", label: "Account ID", type: .text, required: false, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "grafana", categoryId: "observability", name: "Grafana Cloud", description: "Dashboards and alerts", website: "https://grafana.com", authPattern: .api_key, tags: ["metrics", "dashboards"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "instance_url", label: "Instance URL", type: .url, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "auth0", categoryId: "auth_identity", name: "Auth0", description: "Identity platform", website: "https://auth0.com", authPattern: .oauth2, tags: ["auth"], fields: [
            CredentialField(key: "domain", label: "Domain", type: .text, required: true, placeholder: "xxx.auth0.com", helpText: ""),
            CredentialField(key: "client_id", label: "Client ID", type: .text, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "client_secret", label: "Client Secret", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "management_api_token", label: "Management Token (optional)", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "clerk", categoryId: "auth_identity", name: "Clerk", description: "Authentication and user management", website: "https://clerk.com", authPattern: .api_key, tags: ["auth"], fields: [
            CredentialField(key: "secret_key", label: "Secret Key", type: .secret, required: true, placeholder: "sk_live_...", helpText: ""),
            CredentialField(key: "publishable_key", label: "Publishable Key", type: .text, required: false, placeholder: "pk_live_...", helpText: ""),
        ]),
        ProviderTemplate(id: "firebase", categoryId: "auth_identity", name: "Firebase", description: "Auth, Firestore, Cloud Functions", website: "https://firebase.google.com", authPattern: .service_account_json, tags: ["baas", "auth"], fields: [
            CredentialField(key: "service_account_json", label: "Service Account JSON", type: .json, required: true, placeholder: "{\"type\":\"service_account\",...}", helpText: "Project Settings > Service accounts"),
            CredentialField(key: "project_id", label: "Project ID", type: .text, required: false, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "supabase_auth", categoryId: "auth_identity", name: "Supabase Auth", description: "Auth (shared with Supabase)", website: "https://supabase.com", authPattern: .api_key, tags: ["auth"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "eyJ...", helpText: "Shared with Supabase project key"),
            CredentialField(key: "project_url", label: "Project URL", type: .url, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "cloudflare_r2", categoryId: "storage", name: "Cloudflare R2", description: "S3-compatible object storage", website: "https://dash.cloudflare.com", authPattern: .bearer_token, tags: ["s3"], fields: [
            CredentialField(key: "api_token", label: "API Token", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "account_id", label: "Account ID", type: .text, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "bucket", label: "Bucket Name", type: .text, required: false, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "backblaze_b2", categoryId: "storage", name: "Backblaze B2", description: "Affordable cloud storage", website: "https://backblaze.com", authPattern: .api_key_secret, tags: ["s3"], fields: [
            CredentialField(key: "application_key_id", label: "Application Key ID", type: .text, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "application_key", label: "Application Key", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "minio", categoryId: "storage", name: "MinIO", description: "Self-hosted S3-compatible", website: "https://min.io", authPattern: .access_key_secret, tags: ["s3", "self-hosted"], fields: [
            CredentialField(key: "access_key", label: "Access Key", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "secret_key", label: "Secret Key", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "endpoint", label: "Endpoint", type: .url, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "arweave", categoryId: "storage", name: "Arweave", description: "Permanent decentralized storage", website: "https://arweave.org", authPattern: .service_account_json, tags: ["permanent", "web3"], fields: [
            CredentialField(key: "wallet_json", label: "Wallet JWK", type: .json, required: true, placeholder: "{\"kty\":\"RSA\",...}", helpText: "Arweave wallet JSON Web Key"),
        ]),
        ProviderTemplate(id: "posthog", categoryId: "analytics", name: "PostHog", description: "Product analytics + feature flags", website: "https://posthog.com", authPattern: .api_key, tags: ["analytics"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "phx_...", helpText: "Found in provider dashboard"),
            CredentialField(key: "project_id", label: "Project ID", type: .text, required: false, placeholder: "", helpText: ""),
            CredentialField(key: "host", label: "Host", type: .url, required: false, placeholder: "https://app.posthog.com", helpText: ""),
        ]),
        ProviderTemplate(id: "mixpanel", categoryId: "analytics", name: "Mixpanel", description: "Event analytics", website: "https://mixpanel.com", authPattern: .api_key, tags: ["analytics"], fields: [
            CredentialField(key: "project_token", label: "Project Token", type: .text, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "api_secret", label: "API Secret (optional)", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "amplitude", categoryId: "analytics", name: "Amplitude", description: "Product analytics", website: "https://amplitude.com", authPattern: .api_key, tags: ["analytics"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "secret_key", label: "Secret Key (optional)", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "segment", categoryId: "analytics", name: "Segment", description: "Customer Data Platform", website: "https://segment.com", authPattern: .api_key, tags: ["cdp"], fields: [
            CredentialField(key: "write_key", label: "Write Key", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "n8n", categoryId: "workflow", name: "n8n", description: "Workflow automation", website: "https://n8n.io", authPattern: .api_key, tags: ["automation"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "instance_url", label: "Instance URL", type: .url, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "make", categoryId: "workflow", name: "Make (Integromat)", description: "Visual automation platform", website: "https://make.com", authPattern: .bearer_token, tags: ["automation"], fields: [
            CredentialField(key: "api_token", label: "API Token", type: .secret, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "org_id", label: "Organization ID", type: .text, required: false, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "zapier", categoryId: "workflow", name: "Zapier", description: "No-code automation", website: "https://zapier.com", authPattern: .api_key, tags: ["automation"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "", helpText: "NLA API key"),
        ]),
        ProviderTemplate(id: "docker_hub", categoryId: "container_compute", name: "Docker Hub", description: "Container registry", website: "https://hub.docker.com", authPattern: .bearer_token, tags: ["container"], fields: [
            CredentialField(key: "username", label: "Username", type: .text, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "personal_access_token", label: "Access Token", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "modal", categoryId: "container_compute", name: "Modal", description: "Serverless GPU compute", website: "https://modal.com", authPattern: .api_key_secret, tags: ["gpu", "serverless"], fields: [
            CredentialField(key: "token_id", label: "Token ID", type: .text, required: true, placeholder: "", helpText: ""),
            CredentialField(key: "token_secret", label: "Token Secret", type: .secret, required: true, placeholder: "", helpText: ""),
        ]),
        ProviderTemplate(id: "daytona", categoryId: "container_compute", name: "Daytona", description: "Dev environment management", website: "https://daytona.io", authPattern: .api_key, tags: ["devenv"], fields: [
            CredentialField(key: "api_key", label: "API Key", type: .secret, required: true, placeholder: "sk-...", helpText: "Found in provider dashboard"),
            CredentialField(key: "server_url", label: "Server URL", type: .url, required: true, placeholder: "", helpText: ""),
        ]),
    ]

    static let envPatterns: [EnvPattern] = [
        EnvPattern(pattern: "^OPENAI_API_KEY$", providerId: "openai", fieldKey: "api_key"),
        EnvPattern(pattern: "^OPENAI_ORG(?:ANIZATION)?_ID$", providerId: "openai", fieldKey: "org_id"),
        EnvPattern(pattern: "^OPENAI_PROJECT_ID$", providerId: "openai", fieldKey: "project_id"),
        EnvPattern(pattern: "^OPENAI_BASE_URL$", providerId: "openai", fieldKey: "base_url"),
        EnvPattern(pattern: "^ANTHROPIC_API_KEY$", providerId: "anthropic", fieldKey: "api_key"),
        EnvPattern(pattern: "^GOOGLE_AI_API_KEY$|^GEMINI_API_KEY$", providerId: "google_ai", fieldKey: "api_key"),
        EnvPattern(pattern: "^XAI_API_KEY$|^GROK_API_KEY$", providerId: "xai", fieldKey: "api_key"),
        EnvPattern(pattern: "^DEEPSEEK_API_KEY$", providerId: "deepseek", fieldKey: "api_key"),
        EnvPattern(pattern: "^DASHSCOPE_API_KEY$|^QWEN_API_KEY$", providerId: "qwen", fieldKey: "api_key"),
        EnvPattern(pattern: "^MISTRAL_API_KEY$", providerId: "mistral", fieldKey: "api_key"),
        EnvPattern(pattern: "^COHERE_API_KEY$|^CO_API_KEY$", providerId: "cohere", fieldKey: "api_key"),
        EnvPattern(pattern: "^TOGETHER_API_KEY$", providerId: "together", fieldKey: "api_key"),
        EnvPattern(pattern: "^FIREWORKS_API_KEY$", providerId: "fireworks", fieldKey: "api_key"),
        EnvPattern(pattern: "^GROQ_API_KEY$", providerId: "groq", fieldKey: "api_key"),
        EnvPattern(pattern: "^CEREBRAS_API_KEY$", providerId: "cerebras", fieldKey: "api_key"),
        EnvPattern(pattern: "^SAMBANOVA_API_KEY$", providerId: "sambanova", fieldKey: "api_key"),
        EnvPattern(pattern: "^OPENROUTER_API_KEY$", providerId: "openrouter", fieldKey: "api_key"),
        EnvPattern(pattern: "^AI21_API_KEY$", providerId: "ai21", fieldKey: "api_key"),
        EnvPattern(pattern: "^PERPLEXITY_API_KEY$|^PPLX_API_KEY$", providerId: "perplexity", fieldKey: "api_key"),
        EnvPattern(pattern: "^STABILITY_API_KEY$", providerId: "stability", fieldKey: "api_key"),
        EnvPattern(pattern: "^REPLICATE_API_TOKEN$", providerId: "replicate", fieldKey: "api_token"),
        EnvPattern(pattern: "^RUNWAY_API_KEY$", providerId: "runway", fieldKey: "api_key"),
        EnvPattern(pattern: "^HEYGEN_API_KEY$", providerId: "heygen", fieldKey: "api_key"),
        EnvPattern(pattern: "^ELEVENLABS_API_KEY$", providerId: "elevenlabs", fieldKey: "api_key"),
        EnvPattern(pattern: "^FAL_KEY$|^FAL_API_KEY$", providerId: "fal", fieldKey: "api_key"),
        EnvPattern(pattern: "^LIBTV_ACCESS_KEY$", providerId: "libtv", fieldKey: "access_key"),
        EnvPattern(pattern: "^PINECONE_API_KEY$", providerId: "pinecone", fieldKey: "api_key"),
        EnvPattern(pattern: "^PINECONE_ENVIRONMENT$", providerId: "pinecone", fieldKey: "environment"),
        EnvPattern(pattern: "^WEAVIATE_API_KEY$", providerId: "weaviate", fieldKey: "api_key"),
        EnvPattern(pattern: "^WEAVIATE_URL$", providerId: "weaviate", fieldKey: "cluster_url"),
        EnvPattern(pattern: "^QDRANT_API_KEY$", providerId: "qdrant", fieldKey: "api_key"),
        EnvPattern(pattern: "^QDRANT_URL$", providerId: "qdrant", fieldKey: "cluster_url"),
        EnvPattern(pattern: "^VOYAGE_API_KEY$", providerId: "voyage", fieldKey: "api_key"),
        EnvPattern(pattern: "^JINA_API_KEY$", providerId: "jina", fieldKey: "api_key"),
        EnvPattern(pattern: "^BRAVE_SEARCH_API_KEY$|^BRAVE_API_KEY$", providerId: "brave_search", fieldKey: "api_key"),
        EnvPattern(pattern: "^SERPAPI_API_KEY$|^SERP_API_KEY$", providerId: "serpapi", fieldKey: "api_key"),
        EnvPattern(pattern: "^TAVILY_API_KEY$", providerId: "tavily", fieldKey: "api_key"),
        EnvPattern(pattern: "^EXA_API_KEY$", providerId: "exa", fieldKey: "api_key"),
        EnvPattern(pattern: "^BING_SEARCH_API_KEY$", providerId: "bing_search", fieldKey: "api_key"),
        EnvPattern(pattern: "^GOOGLE_CSE_API_KEY$|^GOOGLE_SEARCH_API_KEY$", providerId: "google_search", fieldKey: "api_key"),
        EnvPattern(pattern: "^GOOGLE_CSE_CX$|^GOOGLE_SEARCH_CX$", providerId: "google_search", fieldKey: "cx"),
        EnvPattern(pattern: "^AWS_ACCESS_KEY_ID$", providerId: "aws", fieldKey: "access_key_id"),
        EnvPattern(pattern: "^AWS_SECRET_ACCESS_KEY$", providerId: "aws", fieldKey: "secret_access_key"),
        EnvPattern(pattern: "^AWS_DEFAULT_REGION$|^AWS_REGION$", providerId: "aws", fieldKey: "region"),
        EnvPattern(pattern: "^AWS_SESSION_TOKEN$", providerId: "aws", fieldKey: "session_token"),
        EnvPattern(pattern: "^GOOGLE_APPLICATION_CREDENTIALS$", providerId: "gcp", fieldKey: "service_account_json"),
        EnvPattern(pattern: "^GCP_PROJECT_ID$|^GCLOUD_PROJECT$", providerId: "gcp", fieldKey: "project_id"),
        EnvPattern(pattern: "^AZURE_TENANT_ID$", providerId: "azure", fieldKey: "tenant_id"),
        EnvPattern(pattern: "^AZURE_CLIENT_ID$", providerId: "azure", fieldKey: "client_id"),
        EnvPattern(pattern: "^AZURE_CLIENT_SECRET$", providerId: "azure", fieldKey: "client_secret"),
        EnvPattern(pattern: "^AZURE_SUBSCRIPTION_ID$", providerId: "azure", fieldKey: "subscription_id"),
        EnvPattern(pattern: "^CLOUDFLARE_API_TOKEN$", providerId: "cloudflare", fieldKey: "api_token"),
        EnvPattern(pattern: "^CLOUDFLARE_ACCOUNT_ID$|^CF_ACCOUNT_ID$", providerId: "cloudflare", fieldKey: "account_id"),
        EnvPattern(pattern: "^VERCEL_TOKEN$|^VERCEL_API_TOKEN$", providerId: "vercel", fieldKey: "api_token"),
        EnvPattern(pattern: "^VERCEL_TEAM_ID$", providerId: "vercel", fieldKey: "team_id"),
        EnvPattern(pattern: "^NETLIFY_AUTH_TOKEN$", providerId: "netlify", fieldKey: "api_token"),
        EnvPattern(pattern: "^RAILWAY_TOKEN$", providerId: "railway", fieldKey: "api_token"),
        EnvPattern(pattern: "^FLY_API_TOKEN$", providerId: "flyio", fieldKey: "api_token"),
        EnvPattern(pattern: "^DIGITALOCEAN_TOKEN$|^DO_API_TOKEN$", providerId: "digitalocean", fieldKey: "api_token"),
        EnvPattern(pattern: "^GITHUB_TOKEN$|^GH_TOKEN$|^GITHUB_PAT$", providerId: "github", fieldKey: "personal_access_token"),
        EnvPattern(pattern: "^GITLAB_TOKEN$|^GITLAB_PAT$", providerId: "gitlab", fieldKey: "personal_access_token"),
        EnvPattern(pattern: "^SUPABASE_KEY$|^SUPABASE_ANON_KEY$|^NEXT_PUBLIC_SUPABASE_ANON_KEY$", providerId: "supabase", fieldKey: "api_key"),
        EnvPattern(pattern: "^SUPABASE_SERVICE_ROLE_KEY$", providerId: "supabase", fieldKey: "service_role_key"),
        EnvPattern(pattern: "^SUPABASE_URL$|^NEXT_PUBLIC_SUPABASE_URL$", providerId: "supabase", fieldKey: "project_url"),
        EnvPattern(pattern: "^NEON_API_KEY$", providerId: "neon", fieldKey: "api_key"),
        EnvPattern(pattern: "^TURSO_AUTH_TOKEN$", providerId: "turso", fieldKey: "api_token"),
        EnvPattern(pattern: "^TURSO_DATABASE_URL$", providerId: "turso", fieldKey: "database_url"),
        EnvPattern(pattern: "^UPSTASH_REDIS_REST_TOKEN$", providerId: "upstash", fieldKey: "api_key"),
        EnvPattern(pattern: "^UPSTASH_REDIS_REST_URL$", providerId: "upstash", fieldKey: "rest_url"),
        EnvPattern(pattern: "^TELEGRAM_BOT_TOKEN$|^TG_BOT_TOKEN$", providerId: "telegram", fieldKey: "bot_token"),
        EnvPattern(pattern: "^DISCORD_BOT_TOKEN$|^DISCORD_TOKEN$", providerId: "discord", fieldKey: "bot_token"),
        EnvPattern(pattern: "^SLACK_BOT_TOKEN$", providerId: "slack", fieldKey: "bot_token"),
        EnvPattern(pattern: "^SLACK_SIGNING_SECRET$", providerId: "slack", fieldKey: "signing_secret"),
        EnvPattern(pattern: "^SENDGRID_API_KEY$", providerId: "sendgrid", fieldKey: "api_key"),
        EnvPattern(pattern: "^RESEND_API_KEY$", providerId: "resend", fieldKey: "api_key"),
        EnvPattern(pattern: "^TWILIO_ACCOUNT_SID$", providerId: "twilio", fieldKey: "account_sid"),
        EnvPattern(pattern: "^TWILIO_AUTH_TOKEN$", providerId: "twilio", fieldKey: "auth_token"),
        EnvPattern(pattern: "^STRIPE_SECRET_KEY$", providerId: "stripe", fieldKey: "secret_key"),
        EnvPattern(pattern: "^STRIPE_PUBLISHABLE_KEY$|^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY$", providerId: "stripe", fieldKey: "publishable_key"),
        EnvPattern(pattern: "^STRIPE_WEBHOOK_SECRET$", providerId: "stripe", fieldKey: "webhook_secret"),
        EnvPattern(pattern: "^SENTRY_DSN$|^NEXT_PUBLIC_SENTRY_DSN$", providerId: "sentry", fieldKey: "dsn"),
        EnvPattern(pattern: "^SENTRY_AUTH_TOKEN$", providerId: "sentry", fieldKey: "auth_token"),
        EnvPattern(pattern: "^DD_API_KEY$|^DATADOG_API_KEY$", providerId: "datadog", fieldKey: "api_key"),
        EnvPattern(pattern: "^DD_APP_KEY$|^DATADOG_APP_KEY$", providerId: "datadog", fieldKey: "app_key"),
        EnvPattern(pattern: "^HELICONE_API_KEY$", providerId: "helicone", fieldKey: "api_key"),
        EnvPattern(pattern: "^LANGCHAIN_API_KEY$|^LANGSMITH_API_KEY$", providerId: "langsmith", fieldKey: "api_key"),
        EnvPattern(pattern: "^LANGFUSE_PUBLIC_KEY$", providerId: "langfuse", fieldKey: "public_key"),
        EnvPattern(pattern: "^LANGFUSE_SECRET_KEY$", providerId: "langfuse", fieldKey: "secret_key"),
        EnvPattern(pattern: "^LANGFUSE_HOST$", providerId: "langfuse", fieldKey: "host"),
        EnvPattern(pattern: "^PORTKEY_API_KEY$", providerId: "portkey", fieldKey: "api_key"),
        EnvPattern(pattern: "^NEW_RELIC_LICENSE_KEY$|^NEW_RELIC_API_KEY$", providerId: "newrelic", fieldKey: "api_key"),
        EnvPattern(pattern: "^AUTH0_DOMAIN$", providerId: "auth0", fieldKey: "domain"),
        EnvPattern(pattern: "^AUTH0_CLIENT_ID$", providerId: "auth0", fieldKey: "client_id"),
        EnvPattern(pattern: "^AUTH0_CLIENT_SECRET$", providerId: "auth0", fieldKey: "client_secret"),
        EnvPattern(pattern: "^CLERK_SECRET_KEY$", providerId: "clerk", fieldKey: "secret_key"),
        EnvPattern(pattern: "^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY$", providerId: "clerk", fieldKey: "publishable_key"),
        EnvPattern(pattern: "^R2_ACCESS_KEY_ID$", providerId: "cloudflare_r2", fieldKey: "api_token"),
        EnvPattern(pattern: "^B2_APPLICATION_KEY_ID$", providerId: "backblaze_b2", fieldKey: "application_key_id"),
        EnvPattern(pattern: "^B2_APPLICATION_KEY$", providerId: "backblaze_b2", fieldKey: "application_key"),
        EnvPattern(pattern: "^NEXT_PUBLIC_POSTHOG_KEY$|^POSTHOG_API_KEY$", providerId: "posthog", fieldKey: "api_key"),
        EnvPattern(pattern: "^POSTHOG_HOST$", providerId: "posthog", fieldKey: "host"),
        EnvPattern(pattern: "^MIXPANEL_TOKEN$|^MIXPANEL_PROJECT_TOKEN$", providerId: "mixpanel", fieldKey: "project_token"),
        EnvPattern(pattern: "^AMPLITUDE_API_KEY$", providerId: "amplitude", fieldKey: "api_key"),
        EnvPattern(pattern: "^SEGMENT_WRITE_KEY$", providerId: "segment", fieldKey: "write_key"),
        EnvPattern(pattern: "^N8N_API_KEY$", providerId: "n8n", fieldKey: "api_key"),
        EnvPattern(pattern: "^DOCKER_HUB_TOKEN$|^DOCKERHUB_TOKEN$", providerId: "docker_hub", fieldKey: "personal_access_token"),
        EnvPattern(pattern: "^MODAL_TOKEN_ID$", providerId: "modal", fieldKey: "token_id"),
        EnvPattern(pattern: "^MODAL_TOKEN_SECRET$", providerId: "modal", fieldKey: "token_secret"),
    ]

    static let providerByID: [String: ProviderTemplate] =
        Dictionary(uniqueKeysWithValues: providers.map { ($0.id, $0) })
    static let categoryByID: [String: CredentialCategory] =
        Dictionary(uniqueKeysWithValues: categories.map { ($0.id, $0) })

    static func provider(_ id: String) -> ProviderTemplate? { providerByID[id] }
    static func category(_ id: String) -> CredentialCategory? { categoryByID[id] }
    static func providers(inCategory id: String) -> [ProviderTemplate] {
        providers.filter { $0.categoryId == id }
    }
}
