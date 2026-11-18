import { Account } from "@ldayton/account";
import { APP } from "./app-profile";
import { diagnostics } from "./diagnostics";
export const account = new Account(APP.id, (code) =>
  diagnostics.event("account." + code),
);
