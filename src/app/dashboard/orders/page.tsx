import type { Metadata } from "next";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeliveryButton } from "@/components/orders/confirm-delivery-button";
import { requireAuth } from "@/services/auth";
import { getBuyerOrders } from "@/services/order-delivery";

export const metadata: Metadata = { title: "Your orders" };

const statusVariant = {
  pending: "outline",
  paid: "accent",
  shipped: "default",
  delivered: "success",
  cancelled: "destructive",
  refunded: "outline",
} as const;

export default async function OrdersDashboardPage() {
  await connection();
  await requireAuth("/dashboard/orders");
  const orders = await getBuyerOrders();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <p className="text-sm font-medium text-primary">Buyer space</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your orders</h1>
        <p className="mt-2 text-muted-foreground">Track your purchases and confirm when an item arrives.</p>
      </header>
      {orders.length ? (
        <ul className="mt-8 space-y-4">
          {orders.map((order) => (
            <li key={order.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <p className="font-medium">Order {order.id.slice(0, 8)}</p>
                <p className="text-sm text-muted-foreground">
                  ₹{order.amount.toFixed(2)} · Placed {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  }).format(new Date(order.createdAt))}
                </p>
                <Badge variant={statusVariant[order.status]}>{order.status}</Badge>
                {order.deliveredAt && (
                  <p className="text-xs text-muted-foreground">
                    Delivery confirmed {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    }).format(new Date(order.deliveredAt))}
                  </p>
                )}
              </div>
              {order.status === "shipped" && <ConfirmDeliveryButton orderId={order.id} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          You have no orders yet.
        </p>
      )}
    </main>
  );
}
