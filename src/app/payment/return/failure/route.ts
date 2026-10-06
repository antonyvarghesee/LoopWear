import { handlePayUReturn } from "@/services/payu-return";

export async function GET(request: Request) {
  return handlePayUReturn(request);
}

export const POST = handlePayUReturn;
