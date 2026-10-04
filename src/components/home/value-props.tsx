import { VALUE_PROPOSITIONS } from "@/lib/placeholder-data";
import { Recycle, Sparkles, Tag, ShieldCheck } from "lucide-react";

export function ValueProps() {
  const icons: Record<string, React.ReactNode> = {
    Recycle: <Recycle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />,
    Sparkles: <Sparkles className="h-6 w-6 text-amber-500" />,
    Tag: <Tag className="h-6 w-6 text-indigo-500" />,
    ShieldCheck: <ShieldCheck className="h-6 w-6 text-blue-500" />,
  };

  return (
    <section id="why-loopwear" className="py-16 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Heading & Mission */}
          <div className="lg:col-span-5 space-y-4">
            <div className="text-xs font-semibold text-primary uppercase tracking-widest">
              Why Choose LoopWear
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Fashion that doesn&apos;t end at one closet.
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Fast fashion produces millions of tons of waste every year. LoopWear makes circular fashion effortless by pairing pre-loved clothing buyers with passionate sellers nationwide.
            </p>
            <div className="pt-2">
              <blockquote className="border-l-2 border-primary pl-4 text-xs italic text-muted-foreground">
                &ldquo;Every item given a second life saves water, raw materials, and carbon emissions compared to producing new fast fashion.&rdquo;
              </blockquote>
            </div>
          </div>

          {/* Right Column: 4 Value Cards */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {VALUE_PROPOSITIONS.map((prop) => (
              <div
                key={prop.title}
                className="flex flex-col rounded-2xl border border-border/60 bg-card p-6 shadow-2xs space-y-3 transition-all duration-300 hover:border-border hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                  {icons[prop.icon] || <Sparkles className="h-6 w-6 text-primary" />}
                </div>
                <h3 className="text-base font-bold text-foreground">
                  {prop.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {prop.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
