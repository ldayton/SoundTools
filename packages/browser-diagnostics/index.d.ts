export type FieldSpec = Record<string, 'number' | 'boolean' | readonly string[]>;
export interface Report { schemaVersion:number; app:string; release:string; [key:string]:unknown }
export interface Client {
 event(code:string, details?:Record<string,unknown>):void;
 frame(time:number,active:boolean):void;
 metric(name:string,value:number):void;
 capture(error:unknown,code?:string):void;
 snapshot():Report;
 report():Promise<Report>;
 persist():Promise<void>;
 clear():Promise<boolean>;
 setSharing(enabled:boolean):Promise<boolean>;
 getState():{sharing:boolean;configured:boolean;status:string};
 ready:Promise<Client>;
 subscribe(fn:()=>void):()=>void;
 dispose():Promise<void>;
}
export function create(options:{app:string;release:string;dsn?:string;sdkUrl?:string;storageTimeoutMs?:number;fields?:FieldSpec;snapshot?:()=>Record<string,unknown>},env?:unknown):Client;
export function attachPanel(client:Client,parent:HTMLElement):HTMLDetailsElement;
export const version:string;
