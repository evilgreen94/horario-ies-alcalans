(function initPatioDutyMerge(globalScope){
  function clean(value){
    return String(value??'').trim();
  }

  function unique(values){
    return [...new Set((Array.isArray(values)?values:[]).map(clean).filter(Boolean))];
  }

  function clonePosition(position){
    return position&&typeof position==='object'?{...position}:null;
  }

  function cloneRotation(item){
    return {
      ...(item&&typeof item==='object'?item:{}),
      positionId:clean(item?.positionId).toLowerCase(),
      teachers:unique(item?.teachers),
      teacherSourceCodes:unique(item?.teacherSourceCodes).map(value=>value.toUpperCase()),
      responsable:clean(item?.responsable)
    };
  }

  function dutyKey(duty){
    return [clean(duty?.sourceCode).toUpperCase(),clean(duty?.kind).toLowerCase(),clean(duty?.label)].join('|');
  }

  function mergePatioSlot(configuredSlot,duties,positionsById={}){
    const base=configuredSlot&&typeof configuredSlot==='object'?configuredSlot:{};
    const positions=(Array.isArray(base.positions)?base.positions:[]).map(clonePosition).filter(Boolean);
    const rotation=(Array.isArray(base.rotation)?base.rotation:[]).map(cloneRotation);
    const allDuties=[...(Array.isArray(base.duties)?base.duties:[]),...(Array.isArray(duties)?duties:[])];
    const mergedDuties=new Map();

    allDuties.forEach(rawDuty=>{
      const sourceCode=clean(rawDuty?.sourceCode).toUpperCase();
      const teacherName=clean(rawDuty?.teacherName);
      if(!sourceCode||!teacherName) return;
      const duty={
        ...rawDuty,
        sourceCode,
        teacherName,
        kind:clean(rawDuty?.kind).toLowerCase()||'other',
        label:clean(rawDuty?.label),
        positionId:clean(rawDuty?.positionId).toLowerCase(),
        fixedPost:clean(rawDuty?.fixedPost)
      };

      if(!duty.positionId&&!duty.fixedPost){
        const existingAssignment=rotation.find(item=>item.teacherSourceCodes.includes(sourceCode));
        if(existingAssignment) duty.positionId=existingAssignment.positionId;
      }

      if(duty.positionId){
        let position=positions.find(item=>clean(item?.id).toLowerCase()===duty.positionId);
        const definedPosition=positionsById?.[duty.positionId];
        if(!position&&definedPosition){
          position=clonePosition(definedPosition);
          positions.push(position);
        }
        if(position){
          let assignment=rotation.find(item=>item.positionId===duty.positionId);
          if(!assignment){
            assignment={positionId:duty.positionId,teachers:[],teacherSourceCodes:[],responsable:'',repeated:false};
            rotation.push(assignment);
          }
          assignment.teachers=unique([...assignment.teachers,teacherName]);
          assignment.teacherSourceCodes=unique([...assignment.teacherSourceCodes,sourceCode]);
          assignment.responsable=assignment.teachers.join(' · ');
        }else{
          duty.positionId='';
        }
      }

      const key=dutyKey(duty);
      const previous=mergedDuties.get(key);
      if(!previous||(!previous.positionId&&duty.positionId)) mergedDuties.set(key,duty);
    });

    return {
      ...base,
      positions,
      rotation,
      duties:[...mergedDuties.values()],
      physicalPositionIds:positions.filter(position=>position?.isPhysical).map(position=>position.id),
      extraPositionIds:positions.filter(position=>!position?.isPhysical).map(position=>position.id),
      positionIds:positions.map(position=>position.id)
    };
  }

  const api={mergePatioSlot};
  globalScope.GuardiasPatioDutyMerge=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
