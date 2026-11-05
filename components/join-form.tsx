"use client";

import { joinBuilding } from "@/app/join/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionState } from "react";

export function JoinForm() {
  const [state, action, isPending] = useActionState(joinBuilding, {
    error: null,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Join your building</CardTitle>
        <CardDescription>Enter your building code to continue</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-6">
          <div className="grid gap-2">
            <Label htmlFor="code">Building code</Label>
            <Input
              id="code"
              name="code"
              required
              maxLength={20}
              autoComplete="off"
            />
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-red-500">
              {state.error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Joining..." : "Join"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
