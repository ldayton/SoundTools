import { checkGuitar } from "./guitar-check";
await checkGuitar([], true, Number(process.env.TEST_PORT || 4710));
