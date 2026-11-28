import { checkGuitar } from "./guitar-check";
await checkGuitar([1440, 393], false, Number(process.env.TEST_PORT || 4574));
