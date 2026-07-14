"use client";

import { Button } from "@/components/ui/button";
import { FormLayout } from "@/components/ui/form-layout";
import { TextInput } from "@/components/ui/input";
import { useState } from "react";

export function RegisterForm({
  action,
  returnTo
}: {
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={action} className="vf-form">
      <input type="hidden" name="returnTo" value={returnTo} />
      <FormLayout>
        <TextInput label="Name" htmlName="name" value={name} onChange={setName} hasAutoFocus isRequired />
        <TextInput label="Email" type="email" htmlName="email" value={email} onChange={setEmail} isRequired />
        <TextInput
          label="Password"
          type="password"
          htmlName="password"
          value={password}
          onChange={setPassword}
          isRequired
        />
      </FormLayout>
      <Button label="Create account" type="submit" variant="primary" />
    </form>
  );
}
