const crypto=require('crypto');

const DISCORD='https://discord.com/api/v10',
GUILD=process.env.DISCORD_GUILD_ID||'1548652649866596473',
BOT=process.env.DISCORD_BOT_TOKEN,
CLIENT=process.env.DISCORD_CLIENT_ID,
SECRET=process.env.DISCORD_CLIENT_SECRET,
SUPA=process.env.SUPABASE_URL,
SKEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY,
SITE=process.env.SITE_URL,
SESSION=process.env.SESSION_SECRET;

const json=(r)=>new Promise((res,rej)=>{
  let b='';
  r.on('data',x=>b+=x);
  r.on('end',()=>{
    try{
      res(JSON.parse(b||'{}'))
    }catch(e){
      rej(e)
    }
  });
  r.on('error',rej)
});

const send=(res,s,d,h={})=>{
  res.statusCode=s;

  for(const[k,v]of Object.entries(h)){
    res.setHeader(k,v);
  }

  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(d));
};

function sign(x){
  return crypto
    .createHmac('sha256',SESSION)
    .update(x)
    .digest('base64url')
}

function enc(x){
  return Buffer.from(x).toString('base64url')
}

function dec(x){
  return Buffer.from(x,'base64url').toString()
}

const SESSION_MAX_AGE=60*60*24*365*10;

function setCookie(name,value,max){
  const expires=max<=0
    ?'; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    :`; Expires=${new Date(Date.now()+max*1000).toUTCString()}`;

  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${max}${expires}; Priority=High`
}

function noStore(res){
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, private'
  );

  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
}

function session(req){
  const m=(req.headers.cookie||'').match(/pc_session=([^;]+)/);

  if(!m)return null;

  try{
    const[a,b]=m[1].split('.');

    if(!a||!b||b!==sign(a)){
      return null;
    }

    const x=JSON.parse(dec(a));

    return x.exp>Date.now()?x.u:null;
  }catch{
    return null;
  }
}

function sessionCookie(u){
  const payload=enc(
    JSON.stringify({
      u,
      exp:Date.now()+SESSION_MAX_AGE*1000
    })
  );

  return setCookie(
    'pc_session',
    payload+'.'+sign(payload),
    SESSION_MAX_AGE
  );
}


/* ============================================================
   SUPABASE
   ============================================================ */

async function db(path,opt={}){
  try{
    if(!SUPA||!SKEY){
      console.error(
        'Supabase Konfiguration fehlt:',
        {
          SUPABASE_URL:!!SUPA,
          SUPABASE_KEY:!!SKEY
        }
      );

      return {
        ok:false,
        status:500,
        data:null,
        error:new Error('Supabase-Konfiguration fehlt')
      };
    }

    const base=String(SUPA).replace(/\/$/,'');

    const r=await fetch(
      `${base}/rest/v1/${path}`,
      {
        ...opt,
        headers:{
          apikey:SKEY,
          Authorization:`Bearer ${SKEY}`,
          'Content-Type':'application/json',
          ...(opt.headers||{})
        }
      }
    );

    return {
      ok:r.ok,
      status:r.status,
      data:await r.json().catch(()=>null)
    };

  }catch(error){

    console.error(
      'Supabase Request fehlgeschlagen:',
      path,
      error
    );

    return {
      ok:false,
      status:500,
      data:null,
      error
    };
  }
}


/* ============================================================
   DISCORD API
   ============================================================ */

async function dapi(path,opt={}){
  try{

    if(!BOT){
      console.error('DISCORD_BOT_TOKEN fehlt');

      return {
        ok:false,
        status:500,
        data:null,
        error:new Error('Discord Bot Token fehlt')
      };
    }

    const r=await fetch(
      DISCORD+path,
      {
        ...opt,
        headers:{
          Authorization:`Bot ${BOT}`,
          'Content-Type':'application/json',
          ...(opt.headers||{})
        }
      }
    );

    return {
      ok:r.ok,
      status:r.status,
      data:await r.json().catch(()=>null)
    };

  }catch(error){

    console.error(
      'Discord API Request fehlgeschlagen:',
      path,
      error
    );

    return {
      ok:false,
      status:500,
      data:null,
      error
    };
  }
}


/* ============================================================
   DISCORD USER AVATAR
   ============================================================ */

function avatar(u){
  return u.avatar
    ?`https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`
    :'https://cdn.discordapp.com/embed/avatars/0.png'
}


/* ============================================================
   DISCORD MODERATION
   ============================================================ */

async function ban(id){
  const r=await dapi(`/guilds/${GUILD}/bans/${id}`);

  return r.ok?r.data:null;
}

async function cases(id,source){
  const q=
    `guild_id=eq.${encodeURIComponent(GUILD)}`+
    `&user_id=eq.${encodeURIComponent(id)}`+
    `&source=eq.${encodeURIComponent(source)}`+
    `&order=created_at.desc`+
    `&select=*`;

  const r=await db(`moderation_cases?${q}`);

  return r.ok?r.data||[]:[];
}


/* ============================================================
   ROBLOX PROFIL + AVATAR
   ============================================================

   Roblox liefert bei der Thumbnail API teilweise zuerst
   den Status "Pending".

   Deshalb wird die Thumbnail-Abfrage mehrmals wiederholt.

   Das eigentliche Bild wird zusätzlich über
   /api/roblox-avatar serverseitig ausgeliefert.
   ============================================================ */

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

      console.error(
        'Roblox Users API:',
        userResponse.status
      );

      return null;
    }

    const userData=await userResponse.json();

    const profile=userData?.data?.[0];

    if(!profile?.id){

      console.error(
        'Roblox User nicht gefunden:',
        clean
      );

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

        const thumbnailResponse=await fetch(
          thumbnailUrl,
          {
            headers:{
              'Accept':'application/json',
              'User-Agent':'PalmCityRP-Moderationsportal/1.0'
            }
          }
        );

        if(thumbnailResponse.ok){

          const thumbnailData=
            await thumbnailResponse.json();

          const thumbnail=
            thumbnailData?.data?.find(
              x=>String(x.targetId)===userId
            )
            ||
            thumbnailData?.data?.[0];

          if(
            thumbnail?.imageUrl &&
            thumbnail?.state!=='Pending'
          ){

            avatar=thumbnail.imageUrl;

            break;
          }
        }

      }catch(error){

        console.error(
          `Roblox Thumbnail Versuch ${attempt+1}:`,
          error
        );
      }

      if(attempt<3){

        await new Promise(
          resolve=>setTimeout(resolve,500)
        );
      }
    }

    return {
      id:userId,
      username:profile.name||clean,
      displayName:
        profile.displayName||
        profile.name||
        clean,
      avatar:avatar,
      avatarProxy:
        `/api/roblox-avatar?userId=${encodeURIComponent(userId)}`
    };

  }catch(error){

    console.error(
      'Roblox profile lookup failed:',
      error
    );

    return null;
  }
}


/* ============================================================
   ROBLOX AVATAR PROXY
   ============================================================ */

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

      const r=await fetch(
        urls[0],
        {
          headers:{
            'Accept':'application/json',
            'User-Agent':'PalmCityRP-Moderationsportal/1.0'
          }
        }
      );

      if(r.ok){

        const data=
          await r.json().catch(()=>null);

        const item=
          data?.data?.find(
            x=>String(x.targetId)===cleanId
          )
          ||
          data?.data?.[0];

        if(
          item?.imageUrl &&
          item?.state!=='Pending'
        ){

          const image=await fetch(
            item.imageUrl,
            {
              headers:{
                'Accept':'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
                'User-Agent':'PalmCityRP-Moderationsportal/1.0'
              }
            }
          );

          if(image.ok){

            return {
              body:Buffer.from(
                await image.arrayBuffer()
              ),

              contentType:
                image.headers.get('content-type')||
                'image/png'
            };
          }
        }
      }

    }catch(error){

      console.error(
        `Roblox Avatar API Versuch ${attempt+1}:`,
        error
      );
    }

    if(attempt<3){

      await new Promise(
        resolve=>setTimeout(resolve,500)
      );
    }
  }


  /*
   * Fallback für den älteren Roblox Headshot Endpoint.
   */

  try{

    const fallback=await fetch(
      urls[1],
      {
        headers:{
          'Accept':'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
          'User-Agent':'PalmCityRP-Moderationsportal/1.0'
        }
      }
    );

    if(fallback.ok){

      return {
        body:Buffer.from(
          await fallback.arrayBuffer()
        ),

        contentType:
          fallback.headers.get('content-type')||
          'image/png'
      };
    }

    console.error(
      'Roblox Avatar Fallback:',
      fallback.status
    );

  }catch(error){

    console.error(
      'Roblox Avatar Fallback Fehler:',
      error
    );
  }

  return null;
}


/* ============================================================
   API
   ============================================================ */

module.exports=async(req,res)=>{

  try{

    noStore(res);

    const u=new URL(
      req.url,
      `https://${req.headers.host}`
    );

    const p=u.pathname;


    /* ========================================================
       LOGIN
       ======================================================== */

    if(p==='/api/login'){

      const st=enc(
        crypto.randomBytes(24)
      );

      res.statusCode=302;

      res.setHeader(
        'Set-Cookie',
        setCookie('pc_state',st,600)
      );

      res.setHeader(
        'Location',
        `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(CLIENT)}&response_type=code&redirect_uri=${encodeURIComponent(SITE+'/api/callback')}&scope=identify&state=${st}`
      );

      return res.end();
    }


    /* ========================================================
       DISCORD CALLBACK
       ======================================================== */

    if(p==='/api/callback'){

      const code=u.searchParams.get('code');

      const st=u.searchParams.get('state');

      const m=
        (req.headers.cookie||'')
        .match(/pc_state=([^;]+)/);

      if(
        !code||
        !st||
        !m||
        m[1]!==st
      ){

        return send(
          res,
          400,
          {
            error:'Ungültige Anmeldung.'
          }
        );
      }

      const body=new URLSearchParams({
        client_id:CLIENT,
        client_secret:SECRET,
        grant_type:'authorization_code',
        code,
        redirect_uri:SITE+'/api/callback'
      });

      const t=await fetch(
        DISCORD+'/oauth2/token',
        {
          method:'POST',

          headers:{
            'Content-Type':
              'application/x-www-form-urlencoded'
          },

          body
        }
      );

      const td=await t.json();

      const me=await fetch(
        DISCORD+'/users/@me',
        {
          headers:{
            Authorization:
              `Bearer ${td.access_token}`
          }
        }
      ).then(
        r=>r.ok?r.json():null
      );

      if(!me){

        return send(
          res,
          401,
          {
            error:
              'Discord Anmeldung fehlgeschlagen.'
          }
        );
      }

      const user={
        id:me.id,
        username:me.username,
        global_name:me.global_name,
        avatar:avatar(me)
      };

      res.statusCode=302;

      res.setHeader(
        'Set-Cookie',
        sessionCookie(user)
      );

      res.setHeader(
        'Location',
        '/'
      );

      return res.end();
    }


    /* ========================================================
       SESSION
       ======================================================== */

    const me=session(req);

    if(!me){

      return send(
        res,
        401,
        {
          error:'Nicht angemeldet.'
        }
      );
    }


    /* ========================================================
       ROBLOX AVATAR PROXY
       ======================================================== */

    if(p==='/api/roblox-avatar'){

      const userId=
        u.searchParams.get('userId');

      if(!/^\d+$/.test(String(userId||''))){

        res.statusCode=400;

        res.setHeader(
          'Content-Type',
          'application/json'
        );

        return res.end(
          JSON.stringify({
            error:
              'Ungültige Roblox User ID.'
          })
        );
      }

      const image=
        await robloxAvatarImage(userId);

      if(!image){

        res.statusCode=404;

        res.setHeader(
          'Content-Type',
          'application/json'
        );

        return res.end(
          JSON.stringify({
            error:
              'Roblox Avatar konnte nicht geladen werden.'
          })
        );
      }

      res.statusCode=200;

      res.setHeader(
        'Content-Type',
        image.contentType
      );

      res.setHeader(
        'Cache-Control',
        'public, max-age=300, s-maxage=300'
      );

      res.setHeader(
        'Content-Length',
        String(image.body.length)
      );

      return res.end(
        image.body
      );
    }


    /* ========================================================
       /api/me
       ======================================================== */

    if(p==='/api/me'){

      console.log(
        '[API/ME] Start:',
        me.id,
        me.username
      );


      /*
       * Der Session-Cookie darf den eigentlichen
       * /api/me-Aufruf nicht zum Absturz bringen.
       */

      try{

        if(SESSION){

          res.setHeader(
            'Set-Cookie',
            sessionCookie(me)
          );
        }

      }catch(error){

        console.error(
          '[API/ME] Session-Cookie Fehler:',
          error
        );
      }


      /*
       * Jeder externe Dienst wird getrennt behandelt.
       *
       * Ein Fehler bei Discord, Supabase oder Roblox
       * darf nicht mehr den kompletten /api/me-Request
       * auf 500 setzen.
       */

      let b=null;

      try{

        b=await ban(me.id);

      }catch(error){

        console.error(
          '[API/ME] Discord Ban Check Fehler:',
          error
        );
      }


      let ws=[];

      try{

        ws=await cases(
          me.id,
          'discord'
        );

      }catch(error){

        console.error(
          '[API/ME] Discord Cases Fehler:',
          error
        );
      }


      let rl=null;

      try{

        const link=await db(
          `roblox_links?discord_id=${encodeURIComponent(me.id)}&select=*`
        );

        rl=
          link.ok
            ?(link.data||[])[0]||null
            :null;

        if(!link.ok){

          console.error(
            '[API/ME] Roblox Link Query:',
            link.status,
            link.data,
            link.error||''
          );
        }

      }catch(error){

        console.error(
          '[API/ME] Roblox Link Fehler:',
          error
        );
      }


      let rc=[];
      let rp=null;


      if(rl?.username){

        /*
         * Roblox Profil laden.
         */

        try{

          rp=
            await robloxProfile(
              rl.username
            );

        }catch(error){

          console.error(
            '[API/ME] Roblox Profil Fehler:',
            error
          );
        }


        /*
         * Roblox Moderationsfälle laden.
         */

        try{

          const q=
            `guild_id=eq.${encodeURIComponent(GUILD)}`+
            `&source=eq.roblox`+
            `&roblox_username=ilike.${encodeURIComponent(rl.username)}`+
            `&order=created_at.desc`+
            `&select=*`;

          const rr=
            await db(
              `moderation_cases?${q}`
            );

          rc=
            rr.ok
              ?rr.data||[]
              :[];

          if(!rr.ok){

            console.error(
              '[API/ME] Roblox Cases Query:',
              rr.status,
              rr.data,
              rr.error||''
            );
          }

        }catch(error){

          console.error(
            '[API/ME] Roblox Cases Fehler:',
            error
          );
        }
      }


      /*
       * Appeals laden.
       */

      let appeals=[];

      try{

        const ap=await db(
          `appeals?discord_id=${encodeURIComponent(me.id)}&order=created_at.desc&select=*`
        );

        appeals=
          ap.ok
            ?ap.data||[]
            :[];

        if(!ap.ok){

          console.error(
            '[API/ME] Appeals Query:',
            ap.status,
            ap.data,
            ap.error||''
          );
        }

      }catch(error){

        console.error(
          '[API/ME] Appeals Fehler:',
          error
        );
      }


      console.log(
        '[API/ME] Erfolgreich:',
        me.id
      );


      return send(
        res,
        200,
        {
          user:me,

          banned:!!b,

          ban:
            b
              ?{reason:b.reason}
              :null,

          warns:
            Array.isArray(ws)
              ?ws.filter(
                x=>[
                  'warn',
                  'discord_warn'
                ].includes(
                  String(
                    x.action
                  ).toLowerCase()
                )
              )
              :[],

          roblox:{
            username:
              rl?.username||null,

            profile:rp,

            cases:rc
          },

          appeals:appeals
        }
      );
    }


    /* ========================================================
       ROBLOX VERKNÜPFEN
       ======================================================== */

    if(
      p==='/api/roblox' &&
      req.method==='POST'
    ){

      const x=await json(req);

      const name=
        String(
          x.username||''
        ).trim();

      if(
        !/^[A-Za-z0-9_]{3,20}$/.test(name)
      ){

        return send(
          res,
          400,
          {
            error:
              'Ungültiger Roblox Benutzername.'
          }
        );
      }


      /*
       * Vor dem Speichern prüfen,
       * ob der Roblox Account wirklich existiert.
       */

      const rp=
        await robloxProfile(name);

      if(!rp?.id){

        return send(
          res,
          404,
          {
            error:
              'Dieser Roblox Benutzername wurde nicht gefunden. Bitte überprüfe die Schreibweise.'
          }
        );
      }


      const existing=
        await db(
          `roblox_links?discord_id=${encodeURIComponent(me.id)}&select=*`
        );


      if(!existing.ok){

        return send(
          res,
          500,
          {
            error:
              'Roblox Verknüpfung konnte nicht geprüft werden.'
          }
        );
      }


      if(existing.data?.length){

        return send(
          res,
          409,
          {
            error:
              'Dein Roblox Benutzername wurde bereits fest hinterlegt und kann nicht geändert werden.'
          }
        );
      }


      const r=
        await db(
          'roblox_links',
          {
            method:'POST',

            headers:{
              Prefer:'return=minimal'
            },

            body:JSON.stringify({
              discord_id:me.id,
              username:rp.username,
              updated_at:
                new Date().toISOString()
            })
          }
        );


      return send(
        res,
        r.ok?200:500,

        r.ok
          ?{
              ok:true,
              profile:rp
            }
          :{
              error:
                'Roblox Name konnte nicht gespeichert werden.'
            }
      );
    }


    /* ========================================================
       APPEALS
       ======================================================== */

    if(
      p==='/api/appeals' &&
      req.method==='POST'
    ){

      const x=await json(req);

      const type=
        String(
          x.type||''
        );

      const reason=
        String(
          x.reason||''
        ).trim();

      const caseId=
        x.case_id
          ?String(x.case_id)
          :null;


      if(
        ![
          'discord_ban',
          'discord_warn',
          'roblox'
        ].includes(type)
        ||
        reason.length<10
        ||
        reason.length>2000
      ){

        return send(
          res,
          400,
          {
            error:'Ungültiger Antrag.'
          }
        );
      }


      if(
        type==='discord_ban' &&
        !(await ban(me.id))
      ){

        return send(
          res,
          400,
          {
            error:
              'Du bist aktuell nicht gebannt.'
          }
        );
      }


      if(
        type!=='discord_ban' &&
        !caseId
      ){

        return send(
          res,
          400,
          {
            error:
              'Kein Fall ausgewählt.'
          }
        );
      }


      if(caseId){

        const r=
          await db(
            `moderation_cases?guild_id=${GUILD}&case_id=${encodeURIComponent(caseId)}&select=*`
          );


        if(
          !r.ok||
          !r.data?.[0]||
          String(
            r.data[0].user_id
          )!==String(me.id)
        ){

          return send(
            res,
            403,
            {
              error:
                'Dieser Fall gehört nicht zu dir.'
            }
          );
        }
      }


      const now=
        new Date().toISOString();


      const appealData={
        discord_id:me.id,
        discord_username:me.username,
        type,
        case_id:caseId,
        reason,
        status:'open',
        created_at:now
      };


      let r=
        await db(
          'appeals',
          {
            method:'POST',

            headers:{
              Prefer:
                'return=representation'
            },

            body:JSON.stringify({
              ...appealData,
              discord_notified:false,
              bot_handled:false
            })
          }
        );


      /*
       * Fallback für ältere Supabase-Strukturen,
       * bei denen die zusätzlichen Spalten
       * noch nicht existieren.
       */

      if(!r.ok){

        r=
          await db(
            'appeals',
            {
              method:'POST',

              headers:{
                Prefer:
                  'return=representation'
              },

              body:JSON.stringify(
                appealData
              )
            }
          );
      }


      if(!r.ok){

        console.error(
          'Supabase appeals insert failed:',
          r.status,
          r.data
        );

        return send(
          res,
          500,
          {
            error:
              'Der Antrag konnte nicht gespeichert werden. Supabase: '+
              (
                r.data?.message||
                r.data?.hint||
                r.data?.details||
                ('HTTP '+r.status)
              )
          }
        );
      }


      const appeal=
        Array.isArray(r.data)
          ?r.data[0]
          :r.data;


      const appealId=
        appeal?.id??
        appeal?.appeal_id;


      if(!appealId){

        console.error(
          'Supabase appeal insert returned no id:',
          r.data
        );

        return send(
          res,
          500,
          {
            error:
              'Der Antrag wurde gespeichert, aber es wurde keine Antrags-ID zurückgegeben.'
          }
        );
      }


      const channelId=
        process.env.DISCORD_APPEAL_CHANNEL_ID||
        '1548705694033780867';


      const title=
        type==='discord_ban'
          ?'🔨 Neuer Entbannungsantrag'
          :type==='discord_warn'
            ?'⚠️ Neuer Warnungs-Widerspruch'
            :'🎮 Neuer Roblox-Widerspruch';


      const detail=
        caseId
          ?`Fall: #${caseId}`
          :'Kein Fall';


      const msgBody={

        content:
`**${title}**

**Antrag:** #${appealId}
**Nutzer:** ${me.username} (${me.id})
**${detail}**
**Begründung:** ${reason}`,

        allowed_mentions:{
          parse:[]
        },

        components:[
          {
            type:1,

            components:[
              {
                type:2,
                style:3,
                label:'Annehmen',
                emoji:{
                  name:'✅'
                },
                custom_id:
                  `webappeal:accept:${appealId}`
              },

              {
                type:2,
                style:4,
                label:'Ablehnen',
                emoji:{
                  name:'❌'
                },
                custom_id:
                  `webappeal:reject:${appealId}`
              }
            ]
          }
        ]
      };


      const dr=
        await dapi(
          `/channels/${encodeURIComponent(channelId)}/messages`,
          {
            method:'POST',

            headers:{
              'Content-Type':
                'application/json'
            },

            body:JSON.stringify(
              msgBody
            )
          }
        );


      if(!dr.ok){

        console.error(
          'Discord appeal message failed:',
          dr.status,
          dr.data
        );

        return send(
          res,
          502,
          {
            error:
              'Der Antrag wurde gespeichert, konnte aber nicht nach Discord gesendet werden.'
          }
        );
      }


      const discordMessageId=
        dr.data?.id;


      let ur=
        await db(
          `appeals?id=eq.${encodeURIComponent(appealId)}`,
          {
            method:'PATCH',

            headers:{
              Prefer:
                'return=minimal'
            },

            body:JSON.stringify({
              discord_notified:true,
              discord_message_id:
                discordMessageId||null
            })
          }
        );


      /*
       * Fallback, falls die Tabelle statt "id"
       * die Spalte "appeal_id" verwendet.
       */

      if(!ur.ok){

        ur=
          await db(
            `appeals?appeal_id=eq.${encodeURIComponent(appealId)}`,
            {
              method:'PATCH',

              headers:{
                Prefer:
                  'return=minimal'
              },

              body:JSON.stringify({
                discord_notified:true,
                discord_message_id:
                  discordMessageId||null
              })
            }
          );
      }


      return send(
        res,
        200,
        {
          ok:true,
          appeal_id:appealId
        }
      );
    }


    /* ========================================================
       NICHT GEFUNDEN
       ======================================================== */

    return send(
      res,
      404,
      {
        error:'Nicht gefunden.'
      }
    );

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
