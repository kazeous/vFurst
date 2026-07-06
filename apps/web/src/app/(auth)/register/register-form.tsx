"use client";

import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useState } from "react";

export function RegisterForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={action} className="vf-form">
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

