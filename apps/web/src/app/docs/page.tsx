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
          publishing, listing, sharing, deleting — happens through MCP tools your agent
          calls. There is no management UI, on purpose: a dashboard would be one more
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
              {
                name: "share",
                type: "boolean",
                desc: "Readable by anyone with the link. Defaults to false (private)",
              },
            ]}
            returns="id, title, url, shared, createdAt"
          />
          <ToolDoc
            name="list_pages"
            args={[]}
            returns="The 200 newest pages, each with its shared state"
          />
          <ToolDoc
            name="share_page"
            args={[{ name: "id", type: "string", desc: "Page to make public" }]}
            returns="A new id and public url — use the url this returns"
          />
          <ToolDoc
            name="unshare_page"
            args={[{ name: "id", type: "string", desc: "Page to make private again" }]}
            returns="A new private id. The previous public link stops working."
          />
          <ToolDoc
            name="delete_page"
            args={[{ name: "id", type: "string", desc: "Page to remove" }]}
            returns="Confirmation"
          />
        </div>
      </Section>

      <Section title="Private by default">
        <p className="text-surface-400">
          A published page answers <code className="text-surface-300">404</code> to anyone
          who isn&apos;t you — not <code className="text-surface-300">401</code>, so a
          guess can&apos;t even confirm the id exists.
        </p>
        <p className="text-surface-400 mt-3">
          To read your own pages in a browser, visit{" "}
          <a href="/unlock" className="text-pagepilot-400 underline">
            /unlock
          </a>{" "}
          once and enter your key. It becomes an{" "}
          <code className="text-surface-300">httpOnly</code> cookie, so no script on the
          page can read it. That page is the only UI here and it manages nothing.
        </p>
        <p className="text-surface-400 mt-3">
          When you want to send someone a page, call{" "}
          <code className="text-surface-300">share_page</code> — that mints a new public
          URL. <code className="text-surface-300">unshare_page</code> revokes it, and the
          old link stops working immediately rather than merely becoming hidden.
        </p>
        <p className="text-surface-400 mt-3 text-sm">
          Shared pages still send{" "}
          <code className="text-surface-300">X-Robots-Tag: noindex</code> and are excluded
          by <code className="text-surface-300">robots.txt</code>, so a leaked link
          can&apos;t become a search result. It is still a link, though: whoever you send
          it to can forward it, and Slack, Discord and Notion fetch it server-side to
          build previews. Unshare when you&apos;re done.
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
