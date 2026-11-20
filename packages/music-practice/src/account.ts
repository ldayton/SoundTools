import { Account } from "@ldayton/account";
import { APP } from "./app-profile";
import { diagnostics } from "./diagnostics";
export const account = new Account(APP.id, (code, error, details) =>
  error
    ? diagnostics.capture(error, "account." + code, details)
    : diagnostics.event("account." + code, details),
);
