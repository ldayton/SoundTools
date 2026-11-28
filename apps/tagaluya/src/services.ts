import type {Service,Song,SongSection} from "./model";
type SectionContent={title:string;lines:{tagalog?:string;english:string}[]};
const en=(title:string,text:string):SectionContent=>({title,lines:text.trim().split("\n").map(english=>({english}))});
const tl=(title:string,lines:[string,string][]):SectionContent=>({title,lines:lines.map(([tagalog,english])=>({tagalog,english}))});
function song(id:string,title:string,role:string,content:SectionContent[],credit?:string,status:Song["status"]="complete"):Song {
  const sections:SongSection[]=content.map((section,index)=>({id:`${id}-${index}`,title:section.title,phrases:section.lines.map((line,n)=>({id:`${id}-${index}-${n}`,...line}))}));
  return {id,title,role,sections,credit,status};
}
const lifeChorus=en("Chorus",`My life is in You, Lord
My strength is in You, Lord
My hope is in You, Lord
In You, it's in You`);
const lifeVerse=en("Verse",`I will praise You with all of my life
I will praise You with all of my strength
With all of my life, with all of my strength
All my hope is in You`);
const salamatVerse=tl("Verse",[
  ["Ikaw ay mabuti bawat sandali","You are good at every moment"],
  ["Sa habang buhay ay mananatili","And You will remain so forever"],
  ["Hindi mapapawi o maikukubli","It cannot be erased or hidden"],
  ["Maging sa dilim ng gabi","Even in the darkness of night"],
  ["Sandigang matibay ang Iyong pangako","Your promise is a firm foundation"],
  ["Lakas at pag-asa ng aking puso","The strength and hope of my heart"],
  ["Hindi na mabilang pagkakataon","There have been countless occasions"],
  ["Patunay ng katapatan Mo","That testify to Your faithfulness"],
]);
const salamatChorus=tl("Chorus",[
  ["Sa dalamhati at sa kabiguan","In sorrow and in failure"],
  ["Sa pagluha ng pusong nasugatan","In the tears of a wounded heart"],
  ["Sa pagsubok na Iyong pinahihintulutan","In the trials You allow"],
  ["Salamat Panginoon","Thank You, Lord"],
  ["Sa katugunan sa aking dalangin","For the answers to my prayers"],
  ["Sa kalakasang sa'yo nanggagaling","For the strength that comes from You"],
  ["Sa pagtuturo at pagtutuwid Mo sa akin","For teaching and correcting me"],
  ["Salamat Panginoon","Thank You, Lord"],
]);
const goodChorus=tl("Chorus",[
  ["Napakabuti Mo, aking Diyos Ama","You are so good, my God and Father"],
  ["Iyong likha luluwalhatiin Ka","Your creation will glorify You"],
  ["Napakabuti Mo, 'di Ka nagbabago","You are so good; You never change"],
  ["Noon, ngayon, kailan pa man","Then, now, and forever"],
  ["Sa buhay ko'y tapat","You are faithful in my life"],
]);
const worthyPre=tl("Pre-Chorus",[
  ["'Di akalaing tulad ko'y mamahalin","I never thought someone like me would be loved"],
  ["Ngunit pag-ibig na wagas ang Iyong hatid","Yet You bring pure love"],
]);
const worthyChorus=tl("Chorus",[
  ["Hindi kami karapat-dapat","We are not worthy"],
  ["Ngunit buhay Mo ay Iyong inalay","Yet You offered Your life"],
  ["Sa kabila ng lahat, Iyong tinanggap","Despite everything, You accepted us"],
  ["Tinawag Mo kaming Iyong anak","You called us Your children"],
]);
const gloryVerse=en("Verse",`Oh, how beautiful are You, Lord
It's Your words
It's Your love
Oh, how glorious are You, Lord
It's Your power
It was Your cross`);
const gloryPre=en("Pre-Chorus",`That saved me
And rescued me
Just a moment there
Set me free`);
const gloryChorus=en("Chorus",`I give You glory, glory
I give You glory, glory
I give You glory, glory
Jesus
I give You glory, glory
I give You glory, glory
I give You glory, glory
Jesus`);
const thanksVerse=en("Verse 1",`Give thanks with a grateful heart
Give thanks to the Holy One
Give thanks because He's given
Jesus Christ His Son
Give thanks with a grateful heart
Give thanks to the Holy One
Give thanks because He's given
Jesus Christ His Son`);
const thanksChorus=en("Chorus",`And now let the weak say I am strong
Let the poor say I am rich
Because of what the Lord has done for us
And now let the weak say I am strong
Let the poor say I am rich
Because of what the Lord has done for us`);
/** The supplied November 28 program. Content comes from the user's pasted
 * lyrics/reference image and Jesus You Are Glorious PDF; English translations
 * of Tagalog lines are reading translations, not substitute sung lyrics.
 * No unverified melody or external lyrics are shipped. */
export const services:Service[]=[{
  id:"2026-11-28",date:"2026-11-28",title:"Evening service",songs:[
    song("o-kay-saya-at-kay-ganda","O Kay Saya at Kay Ganda","Welcome song",[
      tl("Verse 1",[
        ["O kay saya at kay ganda","Oh, how joyful and beautiful"],
        ["Tayong lahat ay sama-sama","We are all gathered together"],
        ["Umaawit ng papuri","Singing praises"],
        ["Sumasayaw at kumakanta","Dancing and singing"],
      ]),
      tl("Verse 2",[
        ["O kay saya at kay ganda","Oh, how joyful and beautiful"],
        ["Tayong lahat ay sama-sama","We are all gathered together"],
        ["Umaawit ng papuri","Singing praises"],
        ["Sumasamba","Worshipping"],
      ]),
      tl("Chorus",[
        ["Ipalakpak ang iyong kamay","Clap your hands"],
        ["Itaas at iwagayway","Raise them and wave them"],
        ["Sama-samang isisigaw","Together we will shout"],
        ['"Diyos ay buhay!"','"God is alive!"'],
        ["Ipalakpak ang iyong kamay","Clap your hands"],
        ["Itaas at iwagayway","Raise them and wave them"],
        ["Sama-samang isigaw (Wooh!)","Shout together (Wooh!)"],
        ["Sama-samang isigaw (Wooh!)","Shout together (Wooh!)"],
        ["Sama-samang isisigaw","Together we will shout"],
        ['"Diyos ay buhay!"','"God is alive!"'],
      ]),
    ]),
    song("he-is-lord","He Is Lord","Call to worship",[
      en("Chorus 1",`He is Lord, He is Lord
He has risen from the dead and He is Lord
Every knee shall bow, every tongue confess
That Jesus Christ is Lord`),
      en("Chorus 2",`You're my Lord, You're my Lord
You have risen from the dead and You're my Lord
And my knee shall bow and my tongue confess
That Jesus Christ is my Lord`),
      tl("Chorus 3",[
        ["Siya ay Diyos, Siya ay Diyos","He is God, He is God"],
        ["Siya'y nabuhay na muli at Siya ay Diyos","He has risen again, and He is God"],
        ["Lahat ay luluhod, lahat ay magsasabi","Everyone will bow; everyone will proclaim"],
        ["Na si Hesus ay Diyos","That Jesus is God"],
      ]),
    ]),
    song("you-you-are-god","You, You Are God","Praise songs",[
      en("Verse 1",`Here I am, I've come to find You
Here I am, to see Your grace
To bring to You an offering
I have to ask myself one thing
How can I do anything but praise!
I praise!`),
      en("Chorus",`You, You are God, You are Lord
You are all I'm living for
You are King of everything
I want my life to praise You!`),
      en("Verse 2",`Here I am, I've come to thank You
Here I am, a life You've changed
Because You gave Your life for me
You crucified Your Son for me
How can I do anything but praise!
I praise!`),
      en("Chorus",`You, You are God, You are Lord
You are all I'm living for
You are King of everything
I want my life to praise...
You, You are God, You are Lord
You are all I'm living for
You are King of everything
I want my life to praise You!
Yes, Jesus
We praise you tonight!
I want my life to praise You!
Come on church, lift your voices
Sing it out, yeah!`),
      en("Chorus",`You, You are God, You are Lord
You are all I'm living for
You are King of everything
I want my life to praise...
You, You are God, You are Lord
You are all I'm living for
You are King of everything
I want my life to praise You!
I want my life to praise You!
I want my life to praise You`),
    ]),
    song("my-life-is-in-you-lord","My Life Is in You, Lord","Praise songs",[
      {...lifeChorus,title:"Chorus · 1 of 4"},{...lifeChorus,title:"Chorus · 2 of 4"},{...lifeChorus,title:"Chorus · 3 of 4"},{...lifeChorus,title:"Chorus · 4 of 4"},lifeVerse,
      lifeChorus,lifeChorus,lifeVerse,lifeChorus,lifeChorus,
      en("Tag",`In You, it's in You
In You, it's in You`),
    ]),
    song("salamat-panginoon","Salamat Panginoon","Worship songs",[
      salamatVerse,{...salamatChorus,lines:[...salamatChorus.lines,{tagalog:"Salamat",english:"Thank You"}]},salamatVerse,salamatChorus,
      tl("Bridge",[
        ["Ikaw ay mabuti","You are good"],["Ikaw ay tapat","You are faithful"],["Sa'yo ang papuri","To You belong the praise"],["At pasasalamat","And thanksgiving"],
        ["Ikaw ay mabuti","You are good"],["Ikaw ay tapat","You are faithful"],["Sa'yo ang papuri","To You belong the praise"],["At pasasalamat","And thanksgiving"],
      ]),{...salamatChorus,lines:[...salamatChorus.lines,{tagalog:"Salamat",english:"Thank You"}]},
    ],"Musikatha"),
    song("napakabuti-mo","Napakabuti Mo","Worship songs",[
      goodChorus,
      tl("Verse 1",[
        ["Diyos na napakabuti, sa 'Yo ako'y lumalapit","God who is so good, I draw near to You"],
        ["Walang kapantay pag-ibig mong tunay","Your true love is beyond compare"],
        ["Karangalan at papuri'y sa 'Yo lamang lahat","All honor and praise belong to You alone"],
      ]),
      {...goodChorus,lines:goodChorus.lines.map((line,i)=>i===1?{tagalog:line.tagalog+" (Napakabuti Mo)",english:line.english+" (You are so good)"}:line)},
      tl("Interlude",[
        ["Walang katulad, Panginoon, ang Iyong kabutihan sa aming mga buhay","Lord, Your goodness in our lives is without equal"],
        ["Tunay po ang Inyong katapatan","Your faithfulness is truly real"],
        ["Kailanman 'di Kayo nagbabago, Panginoon","You never change, Lord"],
        ["At kahit anuman ang aming nakikita o nararamdaman sa oras na ito","Whatever we may be seeing or feeling right now"],
        ["Patuloy naming ihahayag at ipagmamalaki na Ikaw ay napakabuting Diyos","We will keep declaring and proudly proclaiming that You are a very good God"],
        ["Hallelujah, purihin ang dakila Mong Pangalan","Hallelujah, praise Your great name"],
      ]),
      tl("Verse 2",[
        ["Ikaw ang Panginoon ko, Hari ng aking puso","You are my Lord, King of my heart"],
        ["Tanging sa piling Mo ang kagalakan ko","My joy is found only in Your presence"],
        ["Kapag kasama Mo, O Diyos, lubos ang ligaya, oh","When I am with You, O God, my joy is complete, oh"],
      ]),
      {...goodChorus,lines:[...goodChorus.lines.slice(0,4),{tagalog:"Sa buhay ko'y tapat (Napakabuti Mo)",english:"You are faithful in my life (You are so good)"},
        {tagalog:"Napakabuti Mo, aking Diyos Ama (Napakabuti-buti Mo, O Diyos)",english:"You are so good, my God and Father (You are so very good, O God)"},
        {tagalog:"Iyong likha luluwalhatiin Ka (Wala Kang katulad)",english:"Your creation will glorify You (There is no one like You)"},
        {tagalog:"Napakabuti Mo (Oh), 'di Ka nagbabago",english:"You are so good (Oh); You never change"},...goodChorus.lines.slice(3),...goodChorus.lines.slice(3)]},
    ]),
    song("karapat-dapat","Karapat-Dapat","Altar call",[
      tl("Verse 1",[
        ["Dinggin Mo, aming Ama","Hear us, our Father"],["Itong dalangin na aming inaalay","This prayer that we offer"],["Pawiin Mo ang pusong pagal","Soothe our weary hearts"],["Yakapin Mo kami ng 'Yong pagmamahal","Embrace us with Your love"],
      ]),worthyPre,worthyChorus,
      tl("Verse 2",[
        ["'Di masusukat, 'di nagkukulang","Beyond measure, never lacking"],["Pag-ibig Mo'y sapat sa 'min kailan pa man","Your love is always enough for us"],["Lumalabis, umaapaw","Abundant and overflowing"],["Kagandahang loob na sa ami'y nagligtas","The grace that saved us"],
      ]),{...worthyPre,lines:[...worthyPre.lines,...worthyPre.lines]},
      {...worthyChorus,lines:[...worthyChorus.lines,...worthyChorus.lines]},
      {title:"Instrumental break",lines:[]},
      {...worthyPre,lines:[...worthyPre.lines,...worthyPre.lines]},
      {...worthyChorus,lines:[...worthyChorus.lines,...worthyChorus.lines,...worthyChorus.lines.slice(2)]},
    ]),
    song("jesus-you-are-glorious","Jesus, You Are Glorious","Victory songs",[
      en("Verse",`Prince of Peace
Eternal Lord Of Glory
Mighty God
The Everlasting King`),
      en("Pre-Chorus",`You reign
With glorious pow'r and splendor
Shining bright
Throughout the heavens
Jesus You worthy of our praise`),
      en("Chorus",`Jesus You are glorious
Jesus You are victorious
You conquered death
Hell and grave
So with one voice
We offer praise
And give to You
The glory due Your name`),
    ],"Robert Gay"),
    song("i-give-you-glory","I Give You Glory","Victory songs",[
      gloryVerse,gloryPre,gloryChorus,gloryVerse,gloryPre,gloryChorus,
      en("Bridge",`With a crown of thorns
You became my King forever
And with a crown of thorns
You became my King forever
And with a crown of thorns
You became my King forever
With a crown of thorns
You became my King forever
And with a crown of thorns
You became my King forever
And with a crown of thorns
You became my King forever`),
      en("Pre-Chorus",`That saved me
Oh, and rescued me
Just a moment there
Set me free
Sing that, saved me
That saved me
Oh, and rescued me
Just a moment there
Set me free`),
      {...gloryChorus,lines:gloryChorus.lines.map((line,i)=>i===7?{english:"Jesus (Woo)"}:line)},
      {title:"Instrumental break",lines:[]},
      en("Outro",`(Jesus, Jesus, Jesus, Jesus)
(Jesus, Jesus, Jesus, Jesus)
(Jesus, Jesus, Jesus, Jesus)
(Jesus, Jesus, Jesus, Jesus)
(Jesus, Jesus, Jesus, Jesus, Jesus)`),
    ]),
    song("give-thanks","Give Thanks","Closing song",[
      thanksVerse,thanksChorus,
      en("Verse 2",`Give thanks with a grateful heart (With a grateful heart)
Give thanks to the Holy One (To the Holy One)
Give thanks because He's given
Jesus Christ His Son
Give thanks with a grateful heart (With a grateful heart)
Give thanks to the Holy One (To the Holy One)
Give thanks because He's given
Jesus Christ His Son`),
      {...thanksChorus,lines:[...thanksChorus.lines.slice(0,4),{english:"Let the poor say I am rich (I am rich)"},thanksChorus.lines[5],{english:"Give thanks"}]},
      en("Outro",`We give thanks, hmmmm`),
    ]),
  ],
}];
