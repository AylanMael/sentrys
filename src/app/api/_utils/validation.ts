import { NextRequest, NextResponse } from "next/server";
import { ZodSchema } from "zod";

export async function validateBody<T>(req: NextRequest, schema: ZodSchema<T>) {
  try {
    const body = await req.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return {
        ok: false as const,
        res: NextResponse.json(
          {
            ok: false,
            error: "Validation failed",
            details: result.error.format(),
          },
          { status: 400 }
        ),
      };
    }

    return {
      ok: true as const,
      data: result.data,
    };
  } catch (e) {
    return {
      ok: false as const,
      res: NextResponse.json(
        {
          ok: false,
          error: "Invalid JSON body",
        },
        { status: 400 }
      ),
    };
  }
}
