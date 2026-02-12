import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PageShell } from "../../../components/page-shell";
import { APIRequestError, createPlatform } from "../../../lib/api";
import { recordPublicEvent } from "../../../lib/public-telemetry-store";

export const dynamic = "force-dynamic";

type NewPlatformPageProps = {
  searchParams?: {
    created?: string;
    error?: string;
    source?: string;
    tenant_id?: string;
  };
};

export default function NewPlatformPage({ searchParams }: NewPlatformPageProps) {
  const source = searchParams?.source || "direct";
  const tenantId = searchParams?.tenant_id || "public";

  recordPublicEvent({
    event: "ONBOARDING_ENTRY_VIEW",
    route: "/platforms/new",
    source,
    persona: "P1_PLATFORM_ADMIN",
    tenantId
  });

  async function submit(formData: FormData) {
    "use server";

    const payload = {
      name: String(formData.get("name") || "").trim(),
      type: String(formData.get("type") || "").trim(),
      config: {
        base_url: String(formData.get("base_url") || "").trim(),
        auth_type: String(formData.get("auth_type") || "").trim()
      }
    };

    try {
      await createPlatform(payload);
      recordPublicEvent({
        event: "PLATFORM_CREATE_SUCCESS",
        route: "/platforms/new",
        source,
        persona: "P1_PLATFORM_ADMIN",
        tenantId,
        metadata: {
          platform_type: payload.type || "unknown"
        }
      });
    } catch (error) {
      if (error instanceof APIRequestError) {
        const detail = encodeURIComponent(`${error.code}: ${error.message}`);
        redirect(`/platforms/new?error=${detail}`);
      }
      if (error instanceof Error) {
        redirect(`/platforms/new?error=${encodeURIComponent(error.message)}`);
      }
      redirect("/platforms/new?error=unknown");
    }

    revalidatePath("/platforms");
    redirect("/platforms?created=1");
  }

  const errorMessage = searchParams?.error ? decodeURIComponent(searchParams.error) : "";

  return (
    <PageShell
      title="New platform"
      description="Capture provider credentials and validate connectivity via real API."
    >
      <form action={submit} className="list">
        <div className="list-item">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required placeholder="OpenAI" />
        </div>
        <div className="list-item">
          <label htmlFor="type">Type</label>
          <input id="type" name="type" required placeholder="openai" />
        </div>
        <div className="list-item">
          <label htmlFor="base_url">Base URL</label>
          <input
            id="base_url"
            name="base_url"
            required
            placeholder="https://api.openai.com"
          />
        </div>
        <div className="list-item">
          <label htmlFor="auth_type">Auth Type</label>
          <input id="auth_type" name="auth_type" required placeholder="api_key" />
        </div>
        {errorMessage ? (
          <div className="list-item">
            <strong>Creation failed</strong>
            <p className="muted">{errorMessage}</p>
          </div>
        ) : null}
        <div className="list-item">
          <button type="submit">Create platform</button>
          <Link href="/platforms">Back to platforms</Link>
        </div>
      </form>
    </PageShell>
  );
}
