import { z } from "zod";

export const reviewSubmissionSchema = z.object({
  order_id: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.union([z.string().trim().max(1000), z.null()])
    .optional()
    .transform((comment) => comment || null),
}).strict();

export const publicReviewsQuerySchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9_]{3,20}$/),
  listingId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;
