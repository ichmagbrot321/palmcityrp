
universal-adblock.js:16 [bugsnag] Loaded!
ad-finder.js:68 [bugsnag] Loaded!
einspruch:332  GET https://palmcityrp.vercel.app/api/me 500 (Internal Server Error)
api @ einspruch:332
load @ einspruch:595
(anonym) @ einspruch:716
universal-adblock.js:16 [bugsnag] Loaded!
ad-finder.js:68 [bugsnag] Loaded!
einspruch:332  GET https://palmcityrp.vercel.app/api/me 500 (Internal Server Error)
api @ einspruch:332
load @ einspruch:595
(anonym) @ einspruch:716
{"error":"Interner Fehler."}

8s nachgedacht
Okay, das ist jetzt wichtig: Wenn du wirklich die neue Datei deployed hast, dürfte /api/me mit dem von mir geänderten Code nicht mehr wegen Discord, Supabase oder Roblox einfach auf 500 gehen, weil diese Bereiche einzeln abgefangen werden. 

Das bedeutet: Wir müssen jetzt den echten Fehler aus dem Vercel-Backend herausbekommen. Dein Browser zeigt nur unser absichtlich allgemeines {"error":"Interner Fehler."}.

Mach bitte genau das
In deiner Datei ganz unten hast du aktuell:

  }catch(e){

    console.error(
      '[API] Unbehandelter Fehler:',
      e
    );

    return send(
      res,
      500,
      {
        error:'Interner Fehler.'
      }
    );
  }
};

Ersetze diesen Block vorübergehend durch:

  }catch(e){

    console.error(
      '[API] Unbehandelter Fehler:',
      e
    );

    return send(
      res,
      500,
      {
        error:'Interner Fehler.',
        message:e?.message||String(e),
        name:e?.name||'Error',
        stack:e?.stack||null
      }
    );
  }
};

Dann neu auf Vercel deployen und /api/me nochmal aufrufen.

Danach bekommst du statt

{"error":"Interner Fehler."}

zum Beispiel etwas wie:

{
  "error":"Interner Fehler.",
  "message":"...",
  "name":"...",
  "stack":"..."
}

Schick mir dann genau diese JSON-Antwort.

Dann können wir den tatsächlichen Fehler identifizieren, statt weiter zu raten.

Noch wichtiger
Wenn danach immer noch exakt nur

{"error":"Interner Fehler."}

kommt, obwohl du diesen Block geändert und neu deployed hast, dann läuft auf Vercel nicht die Datei, die du gerade bearbeitest. Dann schauen wir als Nächstes auf den Vercel-Deploy bzw. die API-Dateizuordnung.

Die universal-adblock.js und ad-finder.js Meldungen kannst du dabei komplett ignorieren. Der relevante Fehler ist weiterhin ausschließlich GET /api/me → 500.

dfi verworsst ,ocjdi jimd
Ich glaube, deine Nachricht ist gerade etwas verrutscht 😄 Schreib mir nochmal kurz, was du meinst.




Anzeige
du verwriist mich fixe das einfach

36s nachgedacht
Ja. Ich habe deine aktuelle Datei direkt repariert und anschließend auch einen JavaScript-Syntaxcheck durchgeführt. Der Check ist erfolgreich durchgelaufen.

Die /api/me-Route ist jetzt so aufgebaut, dass Discord, Supabase und Roblox jeweils separat abgefangen werden. Selbst wenn eine dieser Abfragen fehlschlägt, soll /api/me weiterhin die verfügbaren Daten mit 200 zurückgeben.

Hier ist die fertige Datei:

Ersetze deine bisherige Datei damit und deploye sie auf Vercel neu. Danach sollte:

GET /api/me
nicht mehr wegen eines einzelnen Discord/Supabase/Roblox-Fehlers mit 500 abbrechen.


palmcity_api_roblox_avatar(2).js
Code



Anzeige
gebe mir das bitte als .txt datei danke

Klar 👍 


palmcity_api_roblox_avatar_fixed.txt
Dokument



const crypto=require('crypto');
const DISCORD='https://discord.com/api/v10',GUILD=process.env.DISCORD_GUILD_ID||'1548652649866596473',BOT=process.env.DISCORD_BOT_TOKEN,CLIENT=process.env.DISCORD_CLIENT_ID,SECRET=process.env.DISCORD_CLIENT_SECRET,SUPA=process.env.SUPABASE_URL,SKEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY,SITE=process.env.SITE_URL,SESSION=process.env.SESSION_SECRET;
const json=(r)=>new Promise((res,rej)=>{let b='';r.on('data',x=>b+=x);r.on('end',()=>{try{res(JSON.parse(b||'{}'))}catch(e){rej(e)}});r.on('error',rej)});
const send=(res,s,d,h={})=>{res.statusCode=s;for(const[k,v]of Object.entries(h))res.setHeader(k,v);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d))};
function sign(x){return crypto.createHmac('sha256',SESSION).update(x).digest('base64url')}function enc(x){return Buffer.from(x).toString('base64url')}function dec(x){return Buffer.from(x,'base64url').toString()}
const SESSION_MAX_AGE=60*60*24*365*10;
function setCookie(name,value,max){const expires=max<=0?'; Expires=Thu, 01 Jan 1970 00:00:00 GMT':`; Expires=${new Date(Date.now()+max*1000).toUTCString()}`; return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${max}${expires}; Priority=High`}
function noStore(res){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, private');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0')}
function session(req){const m=(req.headers.cookie||'').match(/pc_session=([^;]+)/);if(!m)return null;try{const[a,b]=m[1].split('.');if(!a||!b||b!==sign(a))return null;const x=JSON.parse(dec(a));return x.exp>Date.now()?x.u:null}catch{return null}}
function sessionCookie(u){const payload=enc(JSON.stringify({u,exp:Date.now()+SESSION_MAX_AGE*1000}));return setCookie('pc_session',payload+'.'+sign(payload),SESSION_MAX_AGE)}
async function db(path,opt={}){return fetch(`${SUPA}/rest/v1/${path}`,{...opt,headers:{apikey:SKEY,Authorization:`Bearer ${SKEY}`,'Content-Type':'application/json',...(opt.headers||{})}}).then(async r=>({ok:r.ok,status:r.status,data:await r.json().catch(()=>null)}))}
async function dapi(path,opt={}){return fetch(DISCORD+path,{...opt,headers:{Authorization:`Bot ${BOT}`,'Content-Type':'application/json',...(opt.headers||{})}}).then(async r=>({ok:r.ok,status:r.status,data:await r.json().catch(()=>null)}))}
function avatar(u){return u.avatar?`https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`:'https://cdn.discordapp.com/embed/avatars/0.png'}
async function ban(id){const r=await dapi(`/guilds/${GUILD}/bans/${id}`);return r.ok?r.data:null}
async function cases(id,source){const q=`guild_id=eq.${encodeURIComponent(GUILD)}&user_id=eq.${encodeURIComponent(id)}&source=eq.${encodeURIComponent(source)}&order=created_at.desc&select=*`;const r=await db(`moderation_cases?${q}`);return r.ok?r.data||[]:[]}

/*
 * Roblox Profil + Avatar
 *
 * Roblox liefert bei der Thumbnail API teilweise zuerst den Status
 * "Pending". Deshalb wird die Thumbnail-Abfrage mehrmals wiederholt.
 * Das eigentliche Bild wird zusätzlich über /api/roblox-avatar
 * serverseitig ausgeliefert, damit der Browser nicht direkt von
 * Roblox/CDN abhängig ist.
 */
async function robloxProfile(username){
  try{
    const clean=String(username||'').trim();

    if(!/^[A-Za-z0-9_]{3,20}$/.test(clean)){
      return null;
    }

    const userResponse=await fetch(
      'https://users.roblox.com/v1/usernames/users',
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Accept':'application/json'
        },
        body:JSON.stringify({
          usernames:[clean],
          excludeBannedUsers:false
        })
      }
    );

    if(!userResponse.ok){
      console.error('Roblox Users API:',userResponse.status);
      return null;
    }

    const userData=await userResponse.json();
    const profile=userData?.data?.[0];

    if(!profile?.id){
      console.error('Roblox User nicht gefunden:',clean);
      return null;
    }

    const userId=String(profile.id);

    let avatar=null;

    /*
     * Roblox Thumbnails können kurzzeitig "Pending" liefern.
     * Deshalb bis zu 4 Versuche mit kurzer Pause.
     */
    for(let attempt=0;attempt<4;attempt++){
      try{
        const thumbnailUrl=
          `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(userId)}&size=150x150&format=Png&isCircular=false`;

        const thumbnailResponse=await fetch(thumbnailUrl,{
          headers:{
            'Accept':'application/json',
            'User-Agent':'PalmCityRP-Moderationsportal/1.0'
          }
        });

        if(thumbnailResponse.ok){
          const thumbnailData=await thumbnailResponse.json();
          const thumbnail=thumbnailData?.data?.find(
            x=>String(x.targetId)===userId
          ) || thumbnailData?.data?.[0];

          if(
            thumbnail?.imageUrl &&
            thumbnail?.state !== 'Pending'
          ){
            avatar=thumbnail.imageUrl;
            break;
          }
        }
      }catch(error){
        console.error(`Roblox Thumbnail Versuch ${attempt+1}:`,error);
      }

      if(attempt<3){
        await new Promise(resolve=>setTimeout(resolve,500));
      }
    }

    return {
      id:userId,
      username:profile.name||clean,
      displayName:profile.displayName||profile.name||clean,
      avatar:avatar,
      avatarProxy:`/api/roblox-avatar?userId=${encodeURIComponent(userId)}`
    };
  }catch(error){
    console.error('Roblox profile lookup failed:',error);
    return null;
  }
}

/*
 * Lädt ein Roblox Avatar-Bild serverseitig und gibt es direkt
 * als Bild an den Browser zurück.
 *
 * Das ist zuverlässiger als das Roblox CDN direkt aus dem Frontend
 * aufzurufen.
 */
async function robloxAvatarImage(userId){
  const cleanId=String(userId||'').trim();

  if(!/^\d+$/.test(cleanId)){
    return null;
  }

  const urls=[
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(cleanId)}&size=150x150&format=Png&isCircular=false`,
    `https://www.roblox.com/headshot-thumbnail/image?userId=${encodeURIComponent(cleanId)}&width=150&height=150&format=png`
  ];

  /*
   * Zuerst die moderne Thumbnail API.
   */
  for(let attempt=0;attempt<4;attempt++){
    try{
      const r=await fetch(urls[0],{
        headers:{
          'Accept':'application/json',
          'User-Agent':'PalmCityRP-Moderationsportal/1.0'
        }
      });

      if(r.ok){
        const data=await r.json().catch(()=>null);
        const item=data?.data?.find(
          x=>String(x.targetId)===cleanId
        ) || data?.data?.[0];

        if(item?.imageUrl && item?.state !== 'Pending'){
          const image=await fetch(item.imageUrl,{
            headers:{
              'Accept':'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
              'User-Agent':'PalmCityRP-Moderationsportal/1.0'
            }
          });

          if(image.ok){
            return {
              body:Buffer.from(await image.arrayBuffer()),
              contentType:image.headers.get('content-type')||'image/png'
            };
          }
        }
      }
    }catch(error){
      console.error(`Roblox Avatar API Versuch ${attempt+1}:`,error);
    }

    if(attempt<3){
      await new Promise(resolve=>setTimeout(resolve,500));
    }
  }

  /*
   * Fallback für den älteren Roblox Headshot Endpoint.
   */
  try{
    const fallback=await fetch(urls[1],{
      headers:{
        'Accept':'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
        'User-Agent':'PalmCityRP-Moderationsportal/1.0'
      }
    });

    if(fallback.ok){
      return {
        body:Buffer.from(await fallback.arrayBuffer()),
        contentType:fallback.headers.get('content-type')||'image/png'
      };
    }

    console.error('Roblox Avatar Fallback:',fallback.status);
  }catch(error){
    console.error('Roblox Avatar Fallback Fehler:',error);
  }

  return null;
}


module.exports=async(req,res)=>{
  try{
    noStore(res);
    const u=new URL(req.url,`https://${req.headers.host}`),p=u.pathname;

    if(p==='/api/login'){
      const st=enc(crypto.randomBytes(24));
      res.statusCode=302;
      res.setHeader('Set-Cookie',setCookie('pc_state',st,600));
      res.setHeader('Location',`https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(CLIENT)}&response_type=code&redirect_uri=${encodeURIComponent(SITE+'/api/callback')}&scope=identify&state=${st}`);
      return res.end();
    }

    if(p==='/api/callback'){
      const code=u.searchParams.get('code'),st=u.searchParams.get('state'),m=(req.headers.cookie||'').match(/pc_state=([^;]+)/);
      if(!code||!st||!m||m[1]!==st)return send(res,400,{error:'Ungültige Anmeldung.'});

      const body=new URLSearchParams({
        client_id:CLIENT,
        client_secret:SECRET,
        grant_type:'authorization_code',
        code,
        redirect_uri:SITE+'/api/callback'
      });

      const t=await fetch(DISCORD+'/oauth2/token',{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body
      });

      const td=await t.json();

      const me=await fetch(DISCORD+'/users/@me',{
        headers:{Authorization:`Bearer ${td.access_token}`}
      }).then(r=>r.ok?r.json():null);

      if(!me)return send(res,401,{error:'Discord Anmeldung fehlgeschlagen.'});

      const user={
        id:me.id,
        username:me.username,
        global_name:me.global_name,
        avatar:avatar(me)
      };

      res.statusCode=302;
      res.setHeader('Set-Cookie',sessionCookie(user));
      res.setHeader('Location','/');
      return res.end();
    }

    const me=session(req);
    if(!me)return send(res,401,{error:'Nicht angemeldet.'});

    /*
     * Roblox Avatar Proxy
     *
     * Der Browser ruft nur unsere eigene Domain auf.
     * Dadurch vermeiden wir Probleme mit Roblox CDN, CORS,
     * Referrer und Thumbnail-Status.
     */
    if(p==='/api/roblox-avatar'){
      const userId=u.searchParams.get('userId');

      if(!/^\d+$/.test(String(userId||''))){
        res.statusCode=400;
        res.setHeader('Content-Type','application/json');
        return res.end(JSON.stringify({
          error:'Ungültige Roblox User ID.'
        }));
      }

      const image=await robloxAvatarImage(userId);

      if(!image){
        res.statusCode=404;
        res.setHeader('Content-Type','application/json');
        return res.end(JSON.stringify({
          error:'Roblox Avatar konnte nicht geladen werden.'
        }));
      }

      res.statusCode=200;
      res.setHeader('Content-Type',image.contentType);
      res.setHeader('Cache-Control','public, max-age=300, s-maxage=300');
      res.setHeader('Content-Length',String(image.body.length));
      return res.end(image.body);
    }

    if(p==='/api/me'){
      console.log('[API/ME] request', me?.id||'unknown');

      // Session-Cookie darf /api/me niemals zum Absturz bringen.
      try{
        if(SESSION) res.setHeader('Set-Cookie',sessionCookie(me));
      }catch(error){
        console.error('[API/ME] Session-Cookie Fehler:',error);
      }

      // Alle externen Abfragen sind bewusst voneinander getrennt.
      // Ein Fehler bei einem Dienst darf die gesamte Seite nicht auf 500 setzen.
      let b=null;
      try{ b=await ban(me.id); }
      catch(error){ console.error('[API/ME] ban:',error); }

      let ws=[];
      try{
        const result=await cases(me.id,'discord');
        ws=Array.isArray(result)?result:[];
      }catch(error){ console.error('[API/ME] cases:',error); }

      let rl=null;
      try{
        const link=await db(`roblox_links?discord_id=eq.${encodeURIComponent(me.id)}&select=*`);
        if(link.ok && Array.isArray(link.data)) rl=link.data[0]||null;
        else if(!link.ok) console.error('[API/ME] roblox_links:',link.status,link.data,link.error||'');
      }catch(error){ console.error('[API/ME] roblox_links exception:',error); }

      let rp=null;
      let rc=[];

      if(rl?.username){
        try{
          rp=await robloxProfile(rl.username);
        }catch(error){
          console.error('[API/ME] robloxProfile:',error);
        }

        try{
          const q=`guild_id=eq.${encodeURIComponent(GUILD)}&source=eq.roblox&roblox_username=ilike.${encodeURIComponent(rl.username)}&order=created_at.desc&select=*`;
          const rr=await db(`moderation_cases?${q}`);
          if(rr.ok && Array.isArray(rr.data)) rc=rr.data;
          else if(!rr.ok) console.error('[API/ME] roblox cases:',rr.status,rr.data,rr.error||'');
        }catch(error){
          console.error('[API/ME] roblox cases exception:',error);
        }
      }

      let appeals=[];
      try{
        const ap=await db(`appeals?discord_id=eq.${encodeURIComponent(me.id)}&order=created_at.desc&select=*`);
        if(ap.ok && Array.isArray(ap.data)) appeals=ap.data;
        else if(!ap.ok) console.error('[API/ME] appeals:',ap.status,ap.data,ap.error||'');
      }catch(error){
        console.error('[API/ME] appeals exception:',error);
      }

      const warns=Array.isArray(ws)
        ?ws.filter(x=>['warn','discord_warn'].includes(String(x?.action||'').toLowerCase()))
        :[];

      return send(res,200,{
        user:me,
        banned:!!b,
        ban:b?{reason:b.reason||null}:null,
        warns,
        roblox:{
          username:rl?.username||null,
          profile:rp,
          cases:rc
        },
        appeals
      });
    }

    if(p==='/api/roblox'&&req.method==='POST'){
      const x=await json(req);
      const name=String(x.username||'').trim();

      if(!/^[A-Za-z0-9_]{3,20}$/.test(name)){
        return send(res,400,{error:'Ungültiger Roblox Benutzername.'});
      }

      /*
       * Vor dem Speichern prüfen, ob der Roblox Account wirklich existiert.
       * So wird kein ungültiger Roblox Name dauerhaft verknüpft.
       */
      const rp=await robloxProfile(name);

      if(!rp?.id){
        return send(res,404,{
          error:'Dieser Roblox Benutzername wurde nicht gefunden. Bitte überprüfe die Schreibweise.'
        });
      }

      const existing=await db(`roblox_links?discord_id=eq.${encodeURIComponent(me.id)}&select=*`);

      if(!existing.ok){
        return send(res,500,{error:'Roblox Verknüpfung konnte nicht geprüft werden.'});
      }

      if(existing.data?.length){
        return send(res,409,{
          error:'Dein Roblox Benutzername wurde bereits fest hinterlegt und kann nicht geändert werden.'
        });
      }

      const r=await db('roblox_links',{
        method:'POST',
        headers:{Prefer:'return=minimal'},
        body:JSON.stringify({
          discord_id:me.id,
          username:rp.username,
          updated_at:new Date().toISOString()
        })
      });

      return send(
        res,
        r.ok?200:500,
        r.ok
          ?{ok:true,profile:rp}
          :{error:'Roblox Name konnte nicht gespeichert werden.'}
      );
    }

    if(p==='/api/appeals'&&req.method==='POST'){
      const x=await json(req),type=String(x.type||''),reason=String(x.reason||'').trim(),caseId=x.case_id?String(x.case_id):null;

      if(!['discord_ban','discord_warn','roblox'].includes(type)||reason.length<10||reason.length>2000){
        return send(res,400,{error:'Ungültiger Antrag.'});
      }

      if(type==='discord_ban'&&!(await ban(me.id))){
        return send(res,400,{error:'Du bist aktuell nicht gebannt.'});
      }

      if(type!=='discord_ban'&&!caseId){
        return send(res,400,{error:'Kein Fall ausgewählt.'});
      }

      if(caseId){
        const r=await db(`moderation_cases?guild_id=eq.${GUILD}&case_id=eq.${encodeURIComponent(caseId)}&select=*`);

        if(!r.ok||!r.data?.[0]||String(r.data[0].user_id)!==String(me.id)){
          return send(res,403,{error:'Dieser Fall gehört nicht zu dir.'});
        }
      }

      const now=new Date().toISOString();

      const appealData={
        discord_id:me.id,
        discord_username:me.username,
        type,
        case_id:caseId,
        reason,
        status:'open',
        created_at:now
      };

      let r=await db('appeals',{
        method:'POST',
        headers:{Prefer:'return=representation'},
        body:JSON.stringify({
          ...appealData,
          discord_notified:false,
          bot_handled:false
        })
      });

      if(!r.ok){
        r=await db('appeals',{
          method:'POST',
          headers:{Prefer:'return=representation'},
          body:JSON.stringify(appealData)
        });
      }

      if(!r.ok){
        console.error('Supabase appeals insert failed:',r.status,r.data);
        return send(res,500,{
          error:'Der Antrag konnte nicht gespeichert werden. Supabase: '+(r.data?.message||r.data?.hint||r.data?.details||('HTTP '+r.status))
        });
      }

      const appeal=Array.isArray(r.data)?r.data[0]:r.data;
      const appealId=appeal?.id??appeal?.appeal_id;

      if(!appealId){
        console.error('Supabase appeal insert returned no id:',r.data);
        return send(res,500,{
          error:'Der Antrag wurde gespeichert, aber es wurde keine Antrags-ID zurückgegeben.'
        });
      }

      const channelId=process.env.DISCORD_APPEAL_CHANNEL_ID||'1548705694033780867';

      const title=
        type==='discord_ban'
          ?'🔨 Neuer Entbannungsantrag'
          :type==='discord_warn'
            ?'⚠️ Neuer Warnungs-Widerspruch'
            :'🎮 Neuer Roblox-Widerspruch';

      const detail=caseId?`Fall: #${caseId}`:'Kein Fall';

      const msgBody={
        content:`**${title}**

**Antrag:** #${appealId}
**Nutzer:** ${me.username} (${me.id})
**${detail}**
**Begründung:** ${reason}`,
        allowed_mentions:{parse:[]},
        components:[
          {
            type:1,
            components:[
              {
                type:2,
                style:3,
                label:'Annehmen',
                emoji:{name:'✅'},
                custom_id:`webappeal:accept:${appealId}`
              },
              {
                type:2,
                style:4,
                label:'Ablehnen',
                emoji:{name:'❌'},
                custom_id:`webappeal:reject:${appealId}`
              }
            ]
          }
        ]
      };

      const dr=await dapi(`/channels/${encodeURIComponent(channelId)}/messages`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(msgBody)
      });

      if(!dr.ok){
        console.error('Discord appeal message failed:',dr.status,dr.data);
        return send(res,502,{
          error:'Der Antrag wurde gespeichert, konnte aber nicht nach Discord gesendet werden.'
        });
      }

      const discordMessageId=dr.data?.id;

      let ur=await db(`appeals?id=eq.${encodeURIComponent(appealId)}`,{
        method:'PATCH',
        headers:{Prefer:'return=minimal'},
        body:JSON.stringify({
          discord_notified:true,
          discord_message_id:discordMessageId||null
        })
      });

      if(!ur.ok){
        ur=await db(`appeals?appeal_id=eq.${encodeURIComponent(appealId)}`,{
          method:'PATCH',
          headers:{Prefer:'return=minimal'},
          body:JSON.stringify({
            discord_notified:true,
            discord_message_id:discordMessageId||null
          })
        });
      }

      return send(res,200,{ok:true,appeal_id:appealId});
    }

    return send(res,404,{error:'Nicht gefunden.'});
  }catch(e){
    console.error('[API] Unbehandelter Fehler:',e);
    if(!res.headersSent){
      return send(res,500,{error:'Interner Fehler.'});
    }
    try{res.end()}catch{}
  }
};
