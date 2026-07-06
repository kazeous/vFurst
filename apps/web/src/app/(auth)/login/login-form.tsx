"use client";

import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { TextInput } from "@astryxdesign/core/TextInput";
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

