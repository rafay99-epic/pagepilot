export default function Home() {
  return (
    <>
      <section className="py-20 text-center lg:py-28">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Your AI agent builds it.
          <br />
          <span className="from-pagepilot-400 to-pagepilot-300 bg-gradient-to-r bg-clip-text text-transparent">
            PagePilot deploys it.
          </span>
        </h1>
        <p className="text-surface-400 mx-auto mt-6 max-w-2xl text-lg">
          A private HTML vault for AI agents. One hosted MCP endpoint, your own Cloudflare
          R2 bucket. Nothing to clone, nothing to run locally, and no dashboard to guard.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <a
            href="/docs"
            className="bg-pagepilot-600 hover:bg-pagepilot-500 rounded-lg px-6 py-3 text-sm font-medium text-white transition"
          >
            Connect your agent
          </a>
          <a
            href="/unlock"
            className="border-surface-700 text-surface-300 hover:border-surface-600 rounded-lg border px-6 py-3 text-sm font-medium transition hover:text-white"
          >
            Unlock this browser
          </a>
        </div>
      </section>

      <section className="border-surface-800 grid gap-8 border-t py-20 sm:grid-cols-2 lg:grid-cols-3">
        <FeatureCard
          title="Hosted MCP"
          description="A remote MCP server on your own deployment. One command in Claude Code — no repo to clone, no bun process, no absolute paths to keep in sync."
        />
        <FeatureCard
          title="Private by default"
          description="A deployed page is readable only by you. Sharing is an explicit act, and unsharing revokes the link for anyone already holding it."
        />
        <FeatureCard
          title="One key, whole vault"
          description="Deploy, list and delete all sit behind a single API key. Only the share links you hand out are public."
        />
        <FeatureCard
          title="No UI to attack"
          description="There is no dashboard and no management API. The MCP endpoint is the only authenticated surface, so there is one door to guard instead of three."
        />
        <FeatureCard
          title="Free to host"
          description="Cloudflare R2 gives 10 GB free with zero egress fees. Vercel hobby tier deploys the app. Total cost: $0."
        />
        <FeatureCard
          title="Works with any LLM"
          description="Claude, GPT, Gemini, open models — if the agent supports MCP tools, it can call deploy_page and get a URL back."
        />
      </section>

      <section className="border-surface-800 border-t py-20">
        <h2 className="text-center text-2xl font-bold text-white">How it works</h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          <StepCard
            step="1"
            title="Add the endpoint"
            description="claude mcp add --transport http pagepilot <url> with your key as a bearer header. Same JSON works in Cursor, OpenCode and Claude Desktop."
          />
          <StepCard
            step="2"
            title="Tell your agent what to build"
            description="Prompt naturally: 'Create a landing page for my new product.' The agent generates HTML."
          />
          <StepCard
            step="3"
            title="Read it, then share it if you want"
            description="The agent calls deploy_page(html) and the page is private to you. Call share_page when you actually want a link someone else can open."
          />
        </div>
      </section>

      <section className="border-surface-800 border-t py-20 text-center">
        <h2 className="text-2xl font-bold text-white">
          Ready to stop fighting deployments?
        </h2>
        <p className="text-surface-400 mx-auto mt-4 max-w-lg">
          One endpoint. Your own R2 bucket. Your agents publish, you decide what leaves.
        </p>
        <a
          href="/docs"
          className="bg-pagepilot-600 hover:bg-pagepilot-500 mt-8 inline-block rounded-lg px-6 py-3 text-sm font-medium text-white transition"
        >
          Get started →
        </a>
      </section>
    </>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-surface-800 bg-surface-900/50 rounded-xl border p-6">
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="text-surface-400 mt-2 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border-surface-800 bg-surface-900/50 rounded-xl border p-6 text-center">
      <div className="bg-pagepilot-600 mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white">
        {step}
      </div>
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="text-surface-400 mt-2 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
