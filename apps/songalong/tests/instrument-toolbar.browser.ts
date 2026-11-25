import {checkInstrumentToolbar} from "./instrument-toolbar-check";
await checkInstrumentToolbar([1440,768],true,Number(process.env.TEST_PORT||4613));
