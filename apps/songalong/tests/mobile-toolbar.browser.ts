import {checkInstrumentToolbar} from "./instrument-toolbar-check";
await checkInstrumentToolbar([390,320],false,Number(process.env.TEST_PORT||4699));
