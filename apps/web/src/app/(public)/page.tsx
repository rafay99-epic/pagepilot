import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CircleDollarSign,
  KeyRound,
  Link2,
  Server,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { BorderBeam } from "@/components/ui/border-beam";
import { DotPattern } from "@/components/ui/dot-pattern";
import { CodeBlock } from "@/components/code-block";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const install = `claude mcp add --transport http pagepilot \\
  ${site.mcpUrl} \\
  --header "Authorization: Bearer YOUR_API_KEY"`;

const features = [
  {
    icon: Server,
    title: "Hosted MCP",
    description:
      "A remote MCP server living in your own deployment. One command in Claude Code — no repo to clone, no local process, no absolute paths to keep in sync.",
  },
  {
    icon: Link2,
    title: "Short, unguessable links",
    description:
      "Every page gets a 12-character URL backed by 48 bits of randomness. Nobody finds your pages by guessing or crawling, and nothing is indexed.",
  },
  {
    icon: KeyRound,
    title: "One key, whole vault",
    description:
      "Publishing, listing and deleting all sit behind a single API key you choose, so nobody can enumerate or write to your vault.",
  },
  {
    icon: ShieldCheck,
    title: "No UI to attack",
    description:
      "No dashboard, no login, no management API. The MCP endpoint is the only authenticated surface, so there is one door to guard instead of three.",
  },
  {
    icon: CircleDollarSign,
    title: "Free to host",
    description:
      "Cloudflare R2 gives 10 GB free with zero egress fees, and the Vercel hobby tier deploys the app. Total cost: $0.",
  },
  {
    icon: Bot,
    title: "Works with any LLM",
    description:
      "Claude, GPT, Gemini, open models — if the agent speaks MCP, it can call deploy_page and hand you back a URL.",
  },
];

const steps = [
  {
    title: "Add the endpoint",
    description:
      "One `claude mcp add` command with your key as a bearer header. The same JSON works in Cursor, OpenCode and Claude Desktop.",
  },
  {
    title: "Tell your agent what to build",
    description:
      "Prompt naturally — “write this plan up as an HTML page and publish it.” The agent generates the HTML.",
  },
  {
    title: "Get a link",
    description:
      "The agent calls deploy_page(html) and hands back a short URL. Open it, send it, or delete_page it when you are done.",
  },
];

export default function Home() {
  return (
    <>
      <section className="relative -mx-4 overflow-hidden px-4 pb-24 pt-20 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 lg:pt-28">
        {/* full-bleed backdrop: the section is inside a max-w container, so without
            the w-screen wrapper the glow ends in a visible rectangle */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2">
          <div className="hero-glow absolute inset-0" />
          <DotPattern
            width={22}
            height={22}
            cr={1}
            className={cn(
              "text-white/30",
              "[mask-image:radial-gradient(60%_55%_at_50%_30%,white,transparent)]",
            )}
          />
        </div>

        <div className="mx-auto max-w-3xl text-center">
          <Link
            href="/docs"
            className="border-border/70 bg-card/60 hover:bg-card inline-flex max-w-full items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition"
          >
            <Sparkles className="text-brand-400 size-3.5 shrink-0" />
            <AnimatedShinyText className="mx-0 min-w-0 max-w-none text-left">
              Hosted MCP endpoint — connect an agent in one command
            </AnimatedShinyText>
            <ArrowRight className="text-muted-foreground size-3.5" />
          </Link>

          <h1 className="mt-8 text-balance text-3xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Your AI agent builds it.
            <br />
            <span className="text-gradient">PagePilot deploys it.</span>
          </h1>

          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-pretty text-lg">
            A private HTML vault for AI agents. One hosted MCP endpoint, your own
            Cloudflare R2 bucket. Nothing to clone, nothing to run locally, and no
            dashboard to guard.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" className="h-11 rounded-xl px-6 text-base" asChild>
              <Link href="/docs">
                Connect your agent
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 rounded-xl px-6 text-base"
              asChild
            >
              <a href={site.repo} target="_blank" rel="noreferrer noopener">
                Read the source
              </a>
            </Button>
          </div>
        </div>

        <div className="relative mx-auto mt-16 max-w-3xl">
          <CodeBlock
            code={install}
            label="terminal"
            className="bg-card/80 backdrop-blur"
          />
          <BorderBeam size={140} duration={8} colorFrom="#818cf8" colorTo="#4f46e5" />
        </div>

        <p className="text-muted-foreground mt-8 text-center text-sm">
          Works with Claude Code · Cursor · Claude Desktop · OpenCode · anything that
          speaks MCP
        </p>
      </section>

      <section className="border-t py-20">
        <div className="max-w-2xl">
          <Badge variant="secondary">Why</Badge>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight">
            Everything an agent needs to publish. Nothing it doesn&apos;t.
          </h2>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <Card
              key={title}
              className="bg-card/50 hover:border-brand-500/40 group transition-colors"
            >
              <CardHeader>
                <div className="bg-brand-500/10 text-brand-300 ring-brand-500/20 flex size-10 items-center justify-center rounded-xl ring-1 ring-inset">
                  <Icon className="size-5" />
                </div>
                <CardTitle className="mt-4">{title}</CardTitle>
                <CardDescription className="leading-relaxed">
                  {description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t py-20">
        <div className="max-w-2xl">
          <Badge variant="secondary">How it works</Badge>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight">
            From prompt to public link in three moves.
          </h2>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {steps.map((step, i) => (
            <Card key={step.title} className="bg-card/50 relative overflow-hidden">
              <CardContent className="pr-14">
                <span className="text-brand-500/25 absolute right-4 top-2 -z-0 text-6xl font-bold tabular-nums">
                  {i + 1}
                </span>
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {step.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Badge variant="secondary">Privacy</Badge>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight">
              A page is exactly as private as its link.
            </h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              There is no login and no cookie — the 48-bit id in the URL <em>is</em> the
              credential. Pages ship{" "}
              <code className="text-foreground">X-Robots-Tag: noindex</code> and{" "}
              <code className="text-foreground">robots.txt</code> disallows{" "}
              <code className="text-foreground">/p/</code>, so a leaked link still
              can&apos;t become a search result. When you want a page gone,{" "}
              <code className="text-foreground">delete_page</code> kills the URL within a
              minute.
            </p>
            <Button variant="link" className="mt-4 px-0" asChild>
              <Link href="/docs#privacy">
                Read the threat model
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle className="font-mono text-sm">The three tools</CardTitle>
              <CardDescription>Everything your agent can do, in full.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                ["deploy_page", "publish HTML, get a short URL back"],
                ["list_pages", "the 200 newest pages in the vault"],
                ["delete_page", "revoke a URL for good"],
              ].map(([name, desc]) => (
                <div key={name} className="flex items-baseline gap-3">
                  <code className="text-brand-300 font-mono">{name}</code>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="py-20">
        <Card className="bg-card/60 relative overflow-hidden text-center">
          <div className="hero-glow pointer-events-none absolute inset-0 opacity-70" />
          <CardContent className="relative py-16">
            <WandSparkles className="text-brand-400 mx-auto size-8" />
            <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight">
              Ready to stop fighting deployments?
            </h2>
            <p className="text-muted-foreground mx-auto mt-4 max-w-lg text-pretty">
              One endpoint. Your own R2 bucket. Your agents publish, you get a link.
            </p>
            <Button size="lg" className="mt-8 h-11 rounded-xl px-6 text-base" asChild>
              <Link href="/docs">
                Get started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
          <BorderBeam size={180} duration={10} colorFrom="#a5b4fc" colorTo="#4f46e5" />
        </Card>
      </section>
    </>
  );
}
