import { HOW_IT_WORKS_STEPS } from "@/lib/placeholder-data";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, Search, Camera, CreditCard, Repeat } from "lucide-react";

export function HowItWorks() {
  const stepIcons = [
    <Search key="1" className="h-6 w-6 text-primary" />,
    <Camera key="2" className="h-6 w-6 text-primary" />,
    <CreditCard key="3" className="h-6 w-6 text-primary" />,
    <Repeat key="4" className="h-6 w-6 text-primary" />,
  ];

  return (
    <section id="how-it-works" className="py-16 bg-muted/30 border-y border-border/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-widest">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Simple 4-Step Process</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            How LoopWear Works
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Buying and selling pre-owned fashion should be transparent, effortless, and rewarding for both buyers and sellers.
          </p>
        </div>

        {/* 4 Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {HOW_IT_WORKS_STEPS.map((item, index) => (
            <div
              key={item.step}
              className="relative flex flex-col rounded-2xl border border-border/60 bg-card p-6 shadow-2xs transition-all duration-300 hover:border-border hover:shadow-md"
            >
              {/* Step Number & Icon */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {stepIcons[index]}
                </div>
                <span className="text-2xl font-black text-muted-foreground/40 font-mono">
                  {item.step}
                </span>
              </div>

              {/* Title & Description */}
              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-foreground">
                    {item.title}
                  </h3>
                  <Badge variant="outline" className="text-[10px]">
                    {item.forWho}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
