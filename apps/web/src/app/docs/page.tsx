const MCP_URL = "https://pagepilot.rafay99.com/api/mcp";

export default function Docs() {
  return (
    <div className="py-12">
      <header className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-white">Documentation</h1>
        <p className="text-surface-400 mt-2">
          One hosted MCP endpoint. No dashboard, no local process, nothing to clone.
        </p>
      </header>

      <Section title="How this works">
        <p className="text-surface-400">
          PagePilot is an MCP server that happens to have a landing page. Everything —
          publishing, listing, deleting — happens through MCP tools your agent calls.
          There is no dashboard and no login, on purpose: a UI would be one more
          authenticated surface guarding the same bucket.
        </p>
        <p className="text-surface-400 mt-3">
          The server runs inside this deployment at{" "}
          <code className="text-surface-300">/api/mcp</code>. Your agent talks to it over
          HTTP with your API key. Your R2 credentials never leave the server.
        </p>
      </Section>

      <Section title="Your API key">
        <p className="text-surface-400 mb-4">
          Nobody issues this key — you choose it. It is the only credential your agents
          ever see, and the same value guards every tool.
        </p>
        <CodeBlock label="generate one" code={`openssl rand -hex 32`} />
        <p className="text-surface-400 mt-4 text-sm">
          Set it as <code className="text-surface-300">PAGEPILOT_API_KEY</code> in your
          deployment&apos;s environment variables, then use the same value when adding the
          MCP server below. Your <code className="text-surface-300">R2_*</code>{" "}
          credentials come from Cloudflare and stay server-side.
        </p>
      </Section>

      <Section title="Connect your agent">
        <p className="text-surface-400 mb-4">
          A remote MCP server, so there is no path to get wrong and no runtime to install.
        </p>

        <AgentInstall
          name="Claude Code"
          file="one command"
          config={`claude mcp add --transport http pagepilot \\
  ${MCP_URL} \\
  --header "Authorization: Bearer YOUR_API_KEY"`}
          tip={
            <>
              Then just ask:{" "}
              <em className="text-surface-300">
                &ldquo;Write up the plan as an HTML page and publish it.&rdquo;
              </em>
            </>
          }
        />

        <AgentInstall
          name="Anything that reads mcp.json"
          file="Cursor, OpenCode, Command Code, Claude Desktop"
          config={`{
  "mcpServers": {
    "pagepilot": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}`}
        />

        <AgentInstall
          name="Raw HTTP"
          file="any client that speaks MCP over Streamable HTTP"
          config={`curl -X POST ${MCP_URL} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
        />
      </Section>

      <Section title="Tools">
        <div className="space-y-6">
          <ToolDoc
            name="deploy_page"
            args={[
              { name: "html", type: "string", desc: "Full HTML content (required)" },
              { name: "title", type: "string", desc: "Label shown in the list" },
            ]}
            returns="id, title, url, createdAt"
          />
          <ToolDoc name="list_pages" args={[]} returns="The 200 newest pages" />
          <ToolDoc
            name="delete_page"
            args={[{ name: "id", type: "string", desc: "Page to remove" }]}
            returns="Confirmation"
          />
        </div>
      </Section>

      <Section title="Who can read a page">
        <p className="text-surface-400">
          Anyone holding the link. There is no login and no cookie — the 48-bit id in the
          URL <em>is</em> the credential, so a page is exactly as private as its link.
        </p>
        <p className="text-surface-400 mt-3">
          That means nobody can find your pages by guessing or crawling, but whoever you
          send a link to can forward it, and Slack, Discord and Notion all fetch a URL
          server-side to build previews. Pages send{" "}
          <code className="text-surface-300">X-Robots-Tag: noindex</code> and{" "}
          <code className="text-surface-300">robots.txt</code> disallows{" "}
          <code className="text-surface-300">/p/</code>, so a leaked link still can&apos;t
          become a search result. When you want a page gone, call{" "}
          <code className="text-surface-300">delete_page</code> — the URL dies
          immediately.
        </p>
        <p className="text-surface-400 mt-3">
          Your <code className="text-surface-300">PAGEPILOT_API_KEY</code> guards
          publishing, listing and deleting. Without it nobody can enumerate your vault or
          write to it, even though individual links are readable.
        </p>
      </Section>

      <Section title="Run your own">
        <h3 className="text-surface-200 mb-3 font-semibold">1. Create an R2 bucket</h3>
        <ol className="text-surface-400 list-inside list-decimal space-y-1 text-sm">
          <li>
            <a
              href="https://dash.cloudflare.com"
              className="text-pagepilot-400 underline"
            >
              Cloudflare Dashboard
            </a>{" "}
            → R2 → Create Bucket. Use a bucket dedicated to PagePilot.
          </li>
          <li>
            Leave <strong>public access disabled</strong> — no public development URL, no
            public custom domain on the bucket. Otherwise every page is fetchable straight
            from R2 and everything above is decoration.
          </li>
          <li>
            Create an API token with <strong>Object Read &amp; Write</strong> on that
            bucket
          </li>
          <li>
            Copy the <strong>Access Key ID</strong>, <strong>Secret Access Key</strong>{" "}
            and your <strong>Account ID</strong>
          </li>
        </ol>

        <h3 className="text-surface-200 mb-3 mt-6 font-semibold">2. Deploy to Vercel</h3>
        <p className="text-surface-400 text-sm">
          Import the repo with <strong>Root Directory</strong> set to{" "}
          <code className="text-surface-300">apps/web</code>, then set:
        </p>
        <div className="mt-4">
          <CodeBlock
            label="environment variables"
            code={`R2_BUCKET=your-bucket-name
R2_ACCOUNT_ID=your-32-char-hex-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
PAGEPILOT_API_KEY=the-key-you-generated-above

# Only for a custom domain; otherwise defaults to your Vercel URL
PUBLIC_URL=https://pages.example.com`}
          />
        </div>

        <h3 className="text-surface-200 mb-3 mt-6 font-semibold">3. Local development</h3>
        <p className="text-surface-400 text-sm">
          Put the same values in <code className="text-surface-300">.env.local</code>, run{" "}
          <code className="text-surface-300">bun run dev</code>, and point an agent at{" "}
          <code className="text-surface-300">http://localhost:3000/api/mcp</code>.{" "}
          <code className="text-surface-300">bun run test</code> round-trips real pages
          through your bucket.
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
}: {
  name: string;
  args: { name: string; type: string; desc: string }[];
  returns: string;
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
      <p className="text-surface-500 mt-2 text-sm">
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
    <div className="border-surface-800 bg-surface-900/30 mt-6 rounded-xl border p-5">
      <h3 className="font-semibold text-white">{name}</h3>
      <p className="text-surface-500 mt-0.5 text-xs">{file}</p>
      <pre className="bg-surface-950 text-surface-300 mt-4 overflow-x-auto rounded-lg p-4 text-xs leading-relaxed">
        <code>{config}</code>
      </pre>
      {tip && <p className="text-surface-400 mt-3 text-sm">{tip}</p>}
    </div>
  );
}
