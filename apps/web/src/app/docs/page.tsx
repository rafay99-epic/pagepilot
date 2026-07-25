export default function Docs() {
  return (
    <div className="py-12">
      <header className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-white">Documentation</h1>
        <p className="text-surface-400 mt-2">
          Connect your AI agents to PagePilot in one command.
        </p>
      </header>

      <Section title="Quick Start">
        <p className="text-surface-400 mb-4">
          Write your key to <code className="text-surface-300">~/.pagepilot</code> once
          and every agent picks it up. No environment variables in any config file:
        </p>
        <CodeBlock
          label="one-time setup"
          code={`openssl rand -hex 32 > ~/.pagepilot   # or paste your existing key
chmod 600 ~/.pagepilot`}
        />
        <p className="text-surface-400 mt-4 text-sm">
          Use that same value for{" "}
          <code className="text-surface-300">PAGEPILOT_API_KEY</code> in your Vercel
          environment variables. Nobody issues this key — you choose it, and it is the
          only credential the agents ever see. Your{" "}
          <code className="text-surface-300">R2_*</code> credentials stay on the server.
        </p>
      </Section>

      <Section title="Private by default">
        <p className="text-surface-400">
          A deployed page answers <code className="text-surface-300">404</code> to anyone
          who isn&apos;t you. Unlock the dashboard once with your key and this browser can
          read your pages; agents authenticate with the same key over a header.
        </p>
        <p className="text-surface-400 mt-3">
          When you actually want to send someone a page, call{" "}
          <code className="text-surface-300">share_page</code>. That mints a new public
          URL anyone can open. <code className="text-surface-300">unshare_page</code>{" "}
          revokes it, and the old link stops working immediately rather than merely
          becoming hidden.
        </p>
        <p className="text-surface-400 mt-3 text-sm">
          Shared pages send{" "}
          <code className="text-surface-300">X-Robots-Tag: noindex</code> and are excluded
          by <code className="text-surface-300">robots.txt</code>, so a leaked link
          can&apos;t become a search result. It is still a link: whoever you send it to
          can forward it, and Slack, Discord and Notion fetch it server-side to build
          previews. Unshare when you&apos;re done.
        </p>
      </Section>

      <Section title="MCP Tools">
        <p className="text-surface-400 mb-6">
          Every compatible agent — Claude Code, Cursor, Command Code, OpenCode — can call
          these directly.
        </p>
        <div className="space-y-6">
          <ToolDoc
            name="deploy_page"
            args={[
              {
                name: "html",
                type: "string",
                desc: "The full HTML content of the page (required)",
              },
              {
                name: "title",
                type: "string",
                desc: "Optional label — defaults to an auto-generated name",
              },
              {
                name: "share",
                type: "boolean",
                desc: "Make it readable by anyone with the link. Defaults to false (private)",
              },
            ]}
            returns={
              <>
                Object with <code className="text-surface-300">id</code>,{" "}
                <code className="text-surface-300">title</code>,{" "}
                <code className="text-surface-300">url</code>,{" "}
                <code className="text-surface-300">shared</code>,{" "}
                <code className="text-surface-300">createdAt</code>
              </>
            }
            example={`deploy_page(html: "<h1>Hello</h1>", title: "My Page")`}
          />
          <ToolDoc
            name="list_pages"
            args={[
              { name: "limit", type: "number", desc: "How many to return (default 100)" },
            ]}
            returns="Array of pages, newest first, each with id, title, url, shared, createdAt"
          />
          <ToolDoc
            name="share_page"
            args={[
              { name: "id", type: "string", desc: "The page to make publicly readable" },
            ]}
            returns="The page with a new id and public url — use the url this returns"
          />
          <ToolDoc
            name="unshare_page"
            args={[
              { name: "id", type: "string", desc: "The page to make private again" },
            ]}
            returns="The page with a new private id. The previous public link stops working."
          />
          <ToolDoc
            name="delete_page"
            args={[
              {
                name: "id",
                type: "string",
                desc: "The full page ID returned by list_pages or deploy_page",
              },
            ]}
            returns='{ "ok": true }'
          />
        </div>
      </Section>

      <Section title="One-click install">
        <p className="text-surface-400 mb-6">
          Copy the config for your agent — it is the same everywhere, and holds no secrets
          because the key comes from{" "}
          <code className="text-surface-300">~/.pagepilot</code>. Replace the path with
          wherever you cloned the repo.
        </p>

        <div className="space-y-8">
          <AgentInstall
            name="Claude Code"
            file=".claude/mcp.json"
            config={`{
  "mcpServers": {
    "pagepilot": {
      "command": "bun",
      "args": ["/path/to/pagepilot/tools/mcp-server/src/index.ts"]
    }
  }
}`}
            tip={
              <>
                Claude picks up the tools automatically after saving. Try:{" "}
                <em className="text-surface-300">
                  &ldquo;Build me a landing page and deploy it.&rdquo;
                </em>
              </>
            }
          />

          <AgentInstall
            name="Cursor"
            file="Settings → Features → MCP Servers → Add new server"
            config={`{
  "name": "pagepilot",
  "command": "bun",
  "args": ["/path/to/pagepilot/tools/mcp-server/src/index.ts"]
}`}
          />

          <AgentInstall
            name="Command Code"
            file="~/.commandcode/config.json"
            config={`{
  "mcpServers": {
    "pagepilot": {
      "command": "bun",
      "args": ["/path/to/pagepilot/tools/mcp-server/src/index.ts"]
    }
  }
}`}
          />

          <AgentInstall
            name="OpenCode"
            file="opencode.json"
            config={`{
  "mcpServers": {
    "pagepilot": {
      "command": "bun",
      "args": ["/path/to/pagepilot/tools/mcp-server/src/index.ts"]
    }
  }
}`}
          />
        </div>
      </Section>

      <Section title="Use your own storage (bring your own bucket)">
        <p className="text-surface-400">
          PagePilot stores pages in Cloudflare R2. You run your own instance with your own
          bucket — everything stays under your control.
        </p>

        <h3 className="text-surface-200 mb-3 mt-6 font-semibold">
          Step 1: Create an R2 bucket
        </h3>
        <ol className="text-surface-400 list-inside list-decimal space-y-1 text-sm">
          <li>
            Go to the{" "}
            <a
              href="https://dash.cloudflare.com"
              className="text-pagepilot-400 underline"
            >
              Cloudflare Dashboard
            </a>{" "}
            → R2 → Create Bucket
          </li>
          <li>Name it whatever you like — use a bucket dedicated to PagePilot</li>
          <li>
            Leave <strong>public access disabled</strong>. No public development URL, no
            public custom domain on the bucket — otherwise every page is fetchable
            directly from R2 and the access rules here mean nothing
          </li>
          <li>
            Create an API token with <strong>Object Read &amp; Write</strong> permissions
          </li>
          <li>
            Copy the <strong>Access Key ID</strong>, <strong>Secret Access Key</strong>,
            and <strong>Account ID</strong>
          </li>
        </ol>

        <h3 className="text-surface-200 mb-3 mt-6 font-semibold">
          Step 2: Deploy to Vercel
        </h3>
        <ol className="text-surface-400 list-inside list-decimal space-y-1 text-sm">
          <li>
            Fork or clone the{" "}
            <a
              href="https://github.com/rafay99-epic/pagepilot"
              className="text-pagepilot-400 underline"
            >
              PagePilot repo
            </a>
          </li>
          <li>
            Import the project in Vercel (point it at{" "}
            <code className="text-surface-300">apps/web</code>)
          </li>
          <li>Add these environment variables:</li>
        </ol>

        <div className="mt-4">
          <CodeBlock
            label="Vercel environment variables"
            code={`R2_BUCKET=your-bucket-name
R2_ACCOUNT_ID=your-32-char-hex-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
PAGEPILOT_API_KEY=the-same-value-as-~/.pagepilot

# Only needed for a custom domain; defaults to your Vercel URL
PUBLIC_URL=https://pages.example.com`}
          />
        </div>

        <h3 className="text-surface-200 mb-3 mt-6 font-semibold">
          Step 3: Configure your agent
        </h3>
        <p className="text-surface-400 text-sm">
          Put the key in <code className="text-surface-300">~/.pagepilot</code> and set{" "}
          <code className="text-surface-300">DEFAULT_URL</code> in{" "}
          <code className="text-surface-300">tools/mcp-server/src/index.ts</code> to your
          own deployment. Your agents deploy to{" "}
          <strong className="text-surface-200">your bucket</strong>, served from{" "}
          <strong className="text-surface-200">your domain</strong>.
        </p>
      </Section>

      <Section title="Local development">
        <CodeBlock
          label=".env.local"
          code={`R2_BUCKET=your-bucket
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
PAGEPILOT_API_KEY=dev-test-key
PUBLIC_URL=http://localhost:3000`}
        />
        <p className="text-surface-400 mt-3 text-sm">
          Run <code className="text-surface-300">bun run dev</code> from the repo root.
          The dashboard is at <code className="text-surface-300">/dashboard</code> and the
          tRPC endpoint at <code className="text-surface-300">/api/trpc</code>.
        </p>
        <p className="text-surface-400 mt-3 text-sm">
          The dashboard asks for your{" "}
          <code className="text-surface-300">PAGEPILOT_API_KEY</code> on first visit and
          exchanges it for an <code className="text-surface-300">httpOnly</code> cookie,
          so no script on the page can read your key. Point your agents at{" "}
          <code className="text-surface-300">PAGEPILOT_URL=http://localhost:3000</code> to
          test against this instance.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 text-xl font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function EnvVar({ name, description }: { name: string; description: string }) {
  return (
    <div className="border-surface-800 bg-surface-900/50 flex items-center gap-4 rounded-xl border p-4">
      <code className="text-pagepilot-400 shrink-0 font-mono text-sm font-semibold">
        {name}
      </code>
      <p className="text-surface-400 text-sm">{description}</p>
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="border-surface-800 mt-3 overflow-hidden rounded-xl border">
      <div className="border-surface-800 bg-surface-900/80 text-surface-500 border-b px-4 py-2 text-xs font-medium">
        {label}
      </div>
      <pre className="bg-surface-950 text-surface-300 overflow-x-auto p-4 text-sm">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ToolDoc({
  name,
  args,
  returns,
  example,
}: {
  name: string;
  args: { name: string; type: string; desc: string }[];
  returns: React.ReactNode;
  example?: string;
}) {
  return (
    <div className="border-surface-800 bg-surface-900/50 rounded-xl border p-5">
      <h3 className="text-pagepilot-400 font-mono text-sm font-semibold">{name}</h3>
      {args.length > 0 && (
        <ul className="text-surface-400 mt-2 space-y-1 text-sm">
          {args.map((a) => (
            <li key={a.name}>
              <span className="text-surface-300 font-mono">{a.name}</span>
              <span className="text-surface-600"> ({a.type})</span> — {a.desc}
            </li>
          ))}
        </ul>
      )}
      {example && (
        <p className="text-surface-500 mt-2 text-sm">
          Example: <span className="text-surface-400">{example}</span>
        </p>
      )}
      <p className="text-surface-500 mt-1 text-sm">
        Returns: <span className="text-surface-400">{returns}</span>
      </p>
    </div>
  );
}

function AgentInstall({
  name,
  file,
  config,
  tip,
}: {
  name: string;
  file: string;
  config: string;
  tip?: React.ReactNode;
}) {
  return (
    <div className="border-surface-800 bg-surface-900/30 rounded-xl border p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-white">{name}</h3>
          <p className="text-surface-500 mt-0.5 text-xs">
            Add to <code className="text-surface-400">{file}</code>
          </p>
        </div>
      </div>
      <pre className="bg-surface-950 text-surface-300 mt-4 overflow-x-auto rounded-lg p-4 text-xs leading-relaxed">
        <code>{config}</code>
      </pre>
      {tip && <p className="text-surface-400 mt-3 text-sm">{tip}</p>}
    </div>
  );
}
