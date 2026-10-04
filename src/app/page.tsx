import { HeroSection } from "@/components/home/hero";
import { CategoryGrid } from "@/components/home/category-grid";
import { FeaturedListings } from "@/components/home/featured-listings";
import { HowItWorks } from "@/components/home/how-it-works";
import { ValueProps } from "@/components/home/value-props";
import { CtaSection } from "@/components/home/cta-section";

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <HeroSection />
      <CategoryGrid />
      <FeaturedListings />
      <HowItWorks />
      <ValueProps />
      <CtaSection />
    </div>
  );
}
