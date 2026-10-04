export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16">
      <section className="max-w-2xl space-y-4">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Pre-owned clothing marketplace
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Give clothes another loop.
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          LoopWear is a peer-to-peer marketplace for buying and selling
          pre-owned clothing. The product is being planned and scaffolded;
          listings, accounts, and checkout are not live yet.
        </p>
      </section>
      <section aria-labelledby="coming-soon-heading" className="space-y-3">
        <h2 id="coming-soon-heading" className="text-xl font-semibold">
          Coming soon
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Browse and search clothing listings</li>
          <li>Create a seller profile and list items</li>
          <li>Message sellers and check out securely</li>
        </ul>
      </section>
    </main>
  );
}
