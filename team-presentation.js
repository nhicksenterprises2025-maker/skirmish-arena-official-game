(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SARTeamPresentation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Presentation relationships only. Canonical team keys, participant records,
  // scores and outcomes remain owned by the simulation/tournament engine.
  const COLORS=Object.freeze({blue:'#79c5f3',red:'#f08a87',neutral:'#b3c3d1'});
  const key=value=>value===null||value===undefined?null:String(value);
  function identity(actor){return key(actor?.participantId??actor?.sessionParticipantId??actor?.accountId??actor?.sourceBotId??actor?.profile?.id??actor?.id);}
  function create({mode='tdm',teamIds=[0,1],participants=[],viewerId=null,followId=null,followTeam=false}={}){
    const ffa=mode==='deathmatch',ids=teamIds.slice(),viewerKey=key(viewerId),followKey=key(followId);
    const find=id=>id===null?null:participants.find(a=>identity(a)===id||key(a.id)===id)||null;
    const viewer=find(viewerKey),follow=find(followKey),focus=viewer||follow;
    const focusId=identity(focus),blueTeam=viewer?.team??(followTeam?follow?.team:null)??ids[0];
    const kind=viewer?'player':follow&&((ffa)||followTeam)?'follow':'neutral';
    const perspectiveLabel=kind==='player'?(ffa?'YOU ARE BLUE':'YOUR TEAM IS BLUE'):kind==='follow'?(ffa?'FOLLOWED COMPETITOR IS BLUE':'FOLLOWED TEAM IS BLUE'):'NEUTRAL COLORS';
    function style(side,label,relation,isFocus=false){return {side,color:COLORS[side],label,relation,isFocus};}
    function team(id){
      if(ffa)return style('neutral','COMPETITOR','competitor');
      if(!ids.some(t=>key(t)===key(id)))return style('neutral','UNASSIGNED','unknown');
      const side=key(id)===key(blueTeam)?'blue':'red';
      return style(side,side.toUpperCase(),kind==='neutral'?'canonical':side==='blue'?'ally':'enemy');
    }
    function actor(subject){
      const a=subject&&typeof subject==='object'?subject:find(key(subject));
      if(!a)return style('neutral','UNKNOWN','unknown');
      const isFocus=focusId!==null&&identity(a)===focusId;
      if(ffa){const side=isFocus?'blue':'red';return style(side,isFocus?(viewer?'YOU':'FOLLOWING'):'OPPONENT',isFocus?(viewer?'self':'followed'):'competitor',isFocus);}
      return {...team(a.team),isFocus,relation:viewer&&identity(a)===identity(viewer)?'self':team(a.team).relation};
    }
    function sides(score=[]){return ffa?[]:ids.map((id,index)=>({...team(id),id,score:Number(score[index])||0})).sort((a,b)=>(a.side==='blue'?0:1)-(b.side==='blue'?0:1));}
    return Object.freeze({ffa,kind,perspectiveLabel,viewerId:identity(viewer),followId:identity(follow),actor,team,sides});
  }
  return Object.freeze({COLORS,identity,create});
});
