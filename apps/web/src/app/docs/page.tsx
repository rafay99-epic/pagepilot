import type { Metadata } from "next";
import { ArrowUpRight, Terminal } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "@/components/code-block";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Connect Claude Code, Cursor or any MCP client to PagePilot, and self-host the whole thing on Cloudflare R2 and Vercel for free.",
  alternates: { canonical: "/docs" },
};

const nav = [
  { id: "how-it-works", label: "How this works" },
  { id: "api-key", label: "Your API key" },
  { id: "connect", label: "Connect your agent" },
  { id: "tools", label: "Tools" },
  { id: "privacy", label: "Who can read a page" },
  { id: "run-your-own", label: "Run your own" },
  { id: "faq", label: "FAQ" },
];

const clients = [
  {
    value: "claude-code",
    label: "Claude Code",
    hint: "one command",
    code: `claude mcp add --transport http pagepilot \\
  ${site.mcpUrl} \\
  --header "Authorization: Bearer YOUR_API_KEY"`,
  },
  {
    value: "mcp-json",
    label: "mcp.json",
    hint: "Cursor, OpenCode, Command Code, Claude Desktop",
    code: `{
  "mcpServers": {
    "pagepilot": {
      "type": "http",
      "url": "${site.mcpUrl}",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}`,
  },
  {
    value: "http",
    label: "Raw HTTP",
    hint: "any client that speaks MCP over Streamable HTTP",
    code: `curl -X POST ${site.mcpUrl} \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  },
];

const tools = [
  {
    name: "deploy_page",
    args: [
      { name: "html", type: "string", desc: "Full HTML content (required)" },
      { name: "title", type: "string", desc: "Label shown in the list" },
    ],
    returns: "id, title, url, createdAt",
  },
  { name: "list_pages", args: [], returns: "The 200 newest pages" },
  {
    name: "delete_page",
    args: [{ name: "id", type: "string", desc: "Page to remove" }],
    returns: "Confirmation",
  },
];

const faq = [
  {
    q: "Do I need to clone the repo?",
    a: "No. The MCP server is hosted at /api/mcp inside this deployment. You point your agent at the URL with your key and that is the whole setup. Cloning is only for self-hosting or hacking on it.",
  },
  {
    q: "Where does the HTML actually live?",
    a: "In your own Cloudflare R2 bucket. The R2 credentials stay server-side and the bucket keeps public access disabled, so pages are only reachable through this app's /p/ route.",
  },
  {
    q: "Can someone guess a page URL?",
    a: "Each id is 12 hex characters — 48 bits of randomness. Brute-forcing it is not practical, and nothing links to or indexes your pages.",
  },
  {
    q: "How do I revoke a page?",
    a: "Ask your agent to call delete_page with the id. The object leaves R2 at once; a copy can still be served from the edge cache for up to a minute after that, so treat revocation as taking a minute rather than an instant. There is no other revocation mechanism, by design.",
  },
  {
    q: "Can I use it with GPT or Gemini?",
    a: "Yes. Nothing here is Claude-specific — any client that supports MCP tools over Streamable HTTP works.",
  },
];

export default function Docs() {
  return (
    <div className="py-14 lg:grid lg:grid-cols-[1fr_220px] lg:gap-12">
      <div className="min-w-0">
        <header className="mb-14">
          <Badge variant="secondary">Documentation</Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">
            Connect an agent in a minute.
          </h1>
          <p className="text-muted-foreground mt-3 text-pretty text-lg">
            One hosted MCP endpoint. No dashboard, no local process, nothing to clone.
          </p>
        </header>

        <Section id="how-it-works" title="How this works">
          <p>
            PagePilot is an MCP server that happens to have a landing page. Everything —
            publishing, listing, deleting — happens through MCP tools your agent calls.
            There is no dashboard and no login, on purpose: a UI would be one more
            authenticated surface guarding the same bucket.
          </p>
          <p>
            The server runs inside this deployment at <Code>/api/mcp</Code>. Your agent
            talks to it over HTTP with your API key. Your R2 credentials never leave the
            server.
          </p>
        </Section>

        <Section id="api-key" title="Your API key">
          <p>
            Nobody issues this key — you choose it. It is the only credential your agents
            ever see, and the same value guards every tool.
          </p>
          <CodeBlock label="generate one" code="openssl rand -hex 32" />
          <p>
            Set it as <Code>PAGEPILOT_API_KEY</Code> in your deployment&apos;s environment
            variables, then use the same value when adding the MCP server below. Your{" "}
            <Code>R2_*</Code> credentials come from Cloudflare and stay server-side.
          </p>
        </Section>

        <Section id="connect" title="Connect your agent">
          <p>
            A remote MCP server, so there is no path to get wrong and no runtime to
            install.
          </p>
          <Tabs defaultValue={clients[0].value} className="mt-2">
            <TabsList>
              {clients.map((c) => (
                <TabsTrigger key={c.value} value={c.value}>
                  {c.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {clients.map((c) => (
              <TabsContent key={c.value} value={c.value} className="space-y-3">
                <p className="text-muted-foreground text-sm">{c.hint}</p>
                <CodeBlock label={c.label} code={c.code} />
              </TabsContent>
            ))}
          </Tabs>
          <p className="border-brand-500/40 bg-brand-500/5 text-muted-foreground flex items-start gap-3 rounded-xl border-l-2 px-4 py-3 text-sm">
            <Terminal className="text-brand-400 mt-0.5 size-4 shrink-0" />
            <span>
              Then just ask:{" "}
              <em className="text-foreground">
                “Write up the plan as an HTML page and publish it.”
              </em>
            </span>
          </p>
        </Section>

        <Section id="tools" title="Tools">
          <div className="grid gap-3 sm:grid-cols-2">
            {tools.map((tool) => (
              <Card key={tool.name} className="bg-card/50">
                <CardHeader>
                  <CardTitle className="text-brand-300 font-mono text-sm">
                    {tool.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  {tool.args.length > 0 && (
                    <ul className="space-y-1">
                      {tool.args.map((a) => (
                        <li key={a.name}>
                          <span className="font-mono">{a.name}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            ({a.type}) — {a.desc}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-muted-foreground mt-2">
                    Returns: <span className="text-foreground">{tool.returns}</span>
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <Section id="privacy" title="Who can read a page">
          <p>
            Anyone holding the link. There is no login and no cookie — the 48-bit id in
            the URL <em>is</em> the credential, so a page is exactly as private as its
            link.
          </p>
          <p>
            That means nobody can find your pages by guessing or crawling, but whoever you
            send a link to can forward it, and Slack, Discord and Notion all fetch a URL
            server-side to build previews. Pages send <Code>X-Robots-Tag: noindex</Code>{" "}
            and <Code>robots.txt</Code> disallows <Code>/p/</Code>, so a leaked link still
            can&apos;t become a search result. When you want a page gone, call{" "}
            <Code>delete_page</Code> — the object leaves R2 at once and the URL stops
            serving within a minute, once the edge cache expires.
          </p>
          <p>
            Your <Code>PAGEPILOT_API_KEY</Code> guards publishing, listing and deleting.
            Without it nobody can enumerate your vault or write to it, even though
            individual links are readable.
          </p>
        </Section>

        <Section id="run-your-own" title="Run your own">
          <Step n={1} title="Create an R2 bucket">
            <ol className="text-muted-foreground list-inside list-decimal space-y-1.5 text-sm">
              <li>
                <a
                  href="https://dash.cloudflare.com"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brand-300 inline-flex items-center gap-0.5 underline underline-offset-4"
                >
                  Cloudflare Dashboard
                  <ArrowUpRight className="size-3" />
                </a>{" "}
                → R2 → Create Bucket. Use a bucket dedicated to PagePilot.
              </li>
              <li>
                Leave <strong className="text-foreground">public access disabled</strong>{" "}
                — no public development URL, no public custom domain on the bucket.
                Otherwise every page is fetchable straight from R2 and everything above is
                decoration.
              </li>
              <li>
                Create an API token with{" "}
                <strong className="text-foreground">Object Read &amp; Write</strong> on
                that bucket.
              </li>
              <li>
                Copy the <strong className="text-foreground">Access Key ID</strong>,{" "}
                <strong className="text-foreground">Secret Access Key</strong> and your{" "}
                <strong className="text-foreground">Account ID</strong>.
              </li>
            </ol>
          </Step>

          <Step n={2} title="Deploy to Vercel">
            <p className="text-muted-foreground text-sm">
              Import the repo with <Code>Root Directory</Code> set to{" "}
              <Code>apps/web</Code>, then set:
            </p>
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
          </Step>

          <Step n={3} title="Local development">
            <p className="text-muted-foreground text-sm">
              Put the same values in <Code>.env.local</Code>, run <Code>bun run dev</Code>
              , and point an agent at <Code>http://localhost:3000/api/mcp</Code>.{" "}
              <Code>bun run test</Code> round-trips real pages through your bucket.
            </p>
          </Step>
        </Section>

        <Section id="faq" title="FAQ">
          <Accordion type="single" collapsible className="w-full">
            {faq.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Section>
      </div>

      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-2 text-sm">
          <p className="text-foreground mb-3 font-medium">On this page</p>
          {nav.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="text-muted-foreground hover:text-foreground block transition"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t py-12 first:border-t-0 first:pt-0">
      <h2 className="mb-5 text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="text-muted-foreground space-y-4 leading-relaxed">{children}</div>
    </section>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 first:mt-0">
      <h3 className="text-foreground mb-3 flex items-center gap-2.5 font-medium">
        <span className="bg-brand-500/10 text-brand-300 ring-brand-500/20 flex size-6 items-center justify-center rounded-full text-xs ring-1 ring-inset">
          {n}
        </span>
        {title}
      </h3>
      {/* line up the body with the step title, past the numbered bubble */}
      <div className="space-y-3 pl-[2.125rem]">{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted text-foreground rounded-md px-1.5 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  );
}
