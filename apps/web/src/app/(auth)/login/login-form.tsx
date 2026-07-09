"use client";

import { Button } from "@/components/ui/button";
import { FormLayout } from "@/components/ui/form-layout";
import { TextInput } from "@/components/ui/input";
import { useState } from "react";

export function LoginForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={action} className="vf-form">
      <FormLayout>
        <TextInput
          label="Email"
          type="email"
          htmlName="email"
          value={email}
          onChange={setEmail}
          hasAutoFocus
          isRequired
        />
        <TextInput
          label="Password"
          type="password"
          htmlName="password"
          value={password}
          onChange={setPassword}
          isRequired
        />
      </FormLayout>
      <Button label="Log in" type="submit" variant="primary" />
    </form>
  );
}

