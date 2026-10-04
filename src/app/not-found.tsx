import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center text-center px-6 py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
        <ShoppingBag className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Page Not Found</h1>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
        The clothing item or page you are looking for doesn&apos;t exist or has been moved to another loop.
      </p>
      <Link href="/" className="mt-6">
        <Button className="rounded-full px-6">
          Return to Marketplace
        </Button>
      </Link>
    </div>
  );
}
