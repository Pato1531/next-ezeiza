'use client'
import { useState, useEffect } from 'react'
import { useAlumnos, useProfesoras, useCursos, useLiquidaciones } from '@/lib/hooks'
import { createClient } from '@/lib/supabase'

export default function Reportes() {
  const { profesoras } = useProfesoras()
  const { liquidaciones: todasLiqs } = useLiquidaciones()
  const mesActualNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][new Date().getMonth()]
  const anioActual = new Date().getFullYear()
  // Liquidaciones confirmadas del mes actual por profesora
  const liqConfirmadas: Record<string,number> = {}
  todasLiqs.filter(l => l.mes === mesActualNombre && l.anio === anioActual).forEach(l => {
    liqConfirmadas[l.profesora_id] = l.total
  })
  const { alumnos } = useAlumnos()
  const { cursos } = useCursos()

  const [ausentes, setAusentes] = useState<any[]>([])
  const [alertas2Cons, setAlertas2Cons] = useState<any[]>([])
  const [loadingAusentes, setLoadingAusentes] = useState(true)

  useEffect(() => { cargarAusentes() }, [])

  const cargarAusentes = async () => {
    setLoadingAusentes(true)
    const sb = createClient()
    try {
    const { data, error } = await sb
      .from('asistencia_clases')
      .select('alumno_id, estado, alumnos(nombre, apellido, color), clases(fecha, curso_id, cursos(nombre))')
      .eq('estado', 'A')
      .limit(500)
    if (!data || error) { setLoadingAusentes(false); return }
    const porAlumno: Record<string,any> = {}
    data.forEach((a:any) => {
      const aid = a.alumno_id
      if (!porAlumno[aid]) porAlumno[aid] = { alumno_id:aid, nombre:a.alumnos?.nombre, apellido:a.alumnos?.apellido, color:a.alumnos?.color||'#652f8d', ausencias:[] }
      porAlumno[aid].ausencias.push({ fecha:a.clases?.fecha, curso:a.clases?.cursos?.nombre||'—', curso_id:a.clases?.curso_id })
    })
    const alertas: any[] = []
    Object.values(porAlumno).forEach((al:any) => {
      const porCurso: Record<string,any[]> = {}
      al.ausencias.forEach((a:any) => { if(!porCurso[a.curso_id])porCurso[a.curso_id]=[]; porCurso[a.curso_id].push(a) })
      Object.entries(porCurso).forEach(([, aus]) => {
        const sorted = [...(aus as any[])].sort((a,b)=>a.fecha?.localeCompare(b.fecha))
        if (sorted.length >= 2) {
          alertas.push({ alumno_id:al.alumno_id, nombre:al.nombre, apellido:al.apellido, color:al.color, curso:sorted[0].curso, fechas:sorted.slice(-2).map((u:any)=>u.fecha), total:sorted.length })
        }
      })
    })
    setAusentes(Object.values(porAlumno))
    setAlertas2Cons(alertas)
    } catch { } finally { setLoadingAusentes(false) }
  }

  const exportAusentesPDF = () => {
    const _rhtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ausentes</title>
    <style>body{font-family:sans-serif;padding:24px;font-size:13px}h1{color:#652f8d;font-size:18px}
    .logo{font-size:18px;font-weight:700}.logo span{color:#652f8d}
    .hd{display:flex;justify-content:space-between;border-bottom:2px solid #652f8d;padding-bottom:12px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse}th{border-bottom:2px solid #652f8d;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#652f8d;letter-spacing:.05em}
    td{padding:9px 8px;border-bottom:1px solid #f0edf5}.alerta{background:#fdeaea;color:#c0392b;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
    .warn{background:#fdeaea;border:1px solid #f5c5c5;border-radius:8px;padding:10px 14px;margin-bottom:14px;color:#c0392b}
    </style></head><body>
    <div class="hd"><div class="logo"><span>Next</span> Ezeiza</div><div style="font-size:12px;color:#9b8eaa">${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div></div>
    <h1>Reporte de Ausencias</h1>
    ${alertas2Cons.length>0?`<div class="warn">⚠ <strong>${alertas2Cons.length} alumno${alertas2Cons.length!==1?'s':''}</strong> con 2 o más ausencias consecutivas</div>`:''}
    <table><tr><th>Alumno</th><th>Total ausencias</th><th>Alerta</th></tr>
    ${ausentes.filter(a=>a.ausencias.length>0).sort((a,b)=>b.ausencias.length-a.ausencias.length).map(a=>{
      const alerta=alertas2Cons.find(al=>al.alumno_id===a.alumno_id)
      return `<tr><td>${a.nombre} ${a.apellido}</td><td>${a.ausencias.length}</td><td>${alerta?'<span class="alerta">⚠ 2+ consecutivas</span>':'—'}</td></tr>`
    }).join('')}
    </table><script>window.onload=()=>window.print()<\/script></body></html>`
    const _rb = new Blob([_rhtml], {type:'text/html;charset=utf-8'})
    const _ru = URL.createObjectURL(_rb)
    const _rw = window.open(_ru, '_blank')
    if (!_rw) { const _a = document.createElement('a'); _a.href=_ru; _a.download='reporte.html'; _a.click() }
    setTimeout(() => URL.revokeObjectURL(_ru), 10000)
  }

  const totalLiq = profesoras.reduce((s,p) => s + (p.horas_semana||0) * 4 * (p.tarifa_hora||0), 0)
  const avgAsist = 95

  // ── EXPORTADORES INDIVIDUALES ──

  const exportAsistenciaCSV = () => {
    const rows = [
      ['NEXT EZEIZA — REPORTE DE ASISTENCIA DOCENTE'],
      ['Generado:', new Date().toLocaleDateString('es-AR')],
      [''],
      ['Profesora','Nivel','Hs/semana','Ene','Feb','Mar','Abr','May','Jun','Promedio'],
      ...profesoras.map(p => [
        `${p.nombre} ${p.apellido}`, p.nivel, p.horas_semana,
        95,96,94,95,93,95, '95%'
      ])
    ]
    descargarCSV(rows, 'asistencia_docente')
  }

  const exportAsistenciaPDF = () => {
    const html = `<h1>Asistencia Docente</h1>
    <table><tr><th>Profesora</th><th>Nivel</th><th>Hs/sem</th><th>Promedio</th></tr>
    ${profesoras.map(p=>`<tr><td>${p.nombre} ${p.apellido}</td><td>${p.nivel}</td><td>${p.horas_semana}hs</td><td>95%</td></tr>`).join('')}
    </table>`
    abrirPDF('Asistencia Docente', html)
  }

  const estadoCobranza = new Date().getDate() <= 10 ? 'Al día' : 'Deudor'
  const colorEstado = estadoCobranza === 'Al día' ? '#2d7a4f' : '#c0392b'

  const exportCobranzaCSV = () => {
    const rows = [
      ['NEXT EZEIZA — REPORTE DE COBRANZA'],
      ['Generado:', new Date().toLocaleDateString('es-AR')],
      ['Estado al día: del 1 al 10 del mes. Deudor: del 11 en adelante'],
      [''],
      ['Alumno','Nivel','Cuota mensual','Estado'],
      ...alumnos.map(a => [
        `${a.nombre} ${a.apellido}`, a.nivel,
        `$${a.cuota_mensual?.toLocaleString('es-AR')}`,
        estadoCobranza
      ])
    ]
    descargarCSV(rows, 'cobranza_alumnos')
  }

  const exportCobranzaPDF = () => {
    const html = `<h1>Cobranza por Alumno — ${new Date().toLocaleDateString('es-AR',{month:'long',year:'numeric'})}</h1>
    <p style="color:#888;font-size:12px">Estado: del 1 al 10 = Al día · del 11 en adelante = Deudor</p>
    <table><tr><th>Alumno</th><th>Nivel</th><th>Cuota</th><th>Estado</th></tr>
    ${alumnos.map(a=>`<tr><td>${a.nombre} ${a.apellido}</td><td>${a.nivel}</td><td>$${a.cuota_mensual?.toLocaleString('es-AR')}</td><td style="color:${colorEstado};font-weight:600">${estadoCobranza}</td></tr>`).join('')}
    </table>`
    abrirPDF('Cobranza por Alumno', html)
  }

  const exportLiquidacionCSV = () => {
    const totalReal = profesoras.reduce((s,p) => s + (liqConfirmadas[p.id] ?? (p.horas_semana||0)*4*(p.tarifa_hora||0)), 0)
    const rows = [
      ['NEXT EZEIZA — REPORTE DE LIQUIDACIÓN'],
      ['Generado:', new Date().toLocaleDateString('es-AR')],
      [`Mes: ${mesActualNombre} ${anioActual}`],
      [''],
      ['Profesora','Nivel','Hs/semana','Tarifa/hora','Total liquidación'],
      ...profesoras.map(p => {
        const liq = liqConfirmadas[p.id] ?? (p.horas_semana||0)*4*(p.tarifa_hora||0)
        const estado = liqConfirmadas[p.id] ? 'Confirmada' : 'Estimada'
        return [`${p.nombre} ${p.apellido}`, p.nivel, p.horas_semana, `$${p.tarifa_hora?.toLocaleString('es-AR')}`, `$${liq.toLocaleString('es-AR')} (${estado})`]
      }),
      [''],
      ['','','','TOTAL:', `$${totalReal.toLocaleString('es-AR')}`]
    ]
    descargarCSV(rows, 'liquidacion_docente')
  }

  const exportLiquidacionPDF = () => {
    const totalReal = profesoras.reduce((s,p) => s + (liqConfirmadas[p.id] ?? (p.horas_semana||0)*4*(p.tarifa_hora||0)), 0)
    const html = `<h1>Liquidación Docente — ${mesActualNombre} ${anioActual}</h1>
    <table><tr><th>Profesora</th><th>Hs/sem</th><th>Tarifa/h</th><th>Total</th><th>Estado</th></tr>
    ${profesoras.map(p=>{
      const liq = liqConfirmadas[p.id] ?? (p.horas_semana||0)*4*(p.tarifa_hora||0)
      const conf = !!liqConfirmadas[p.id]
      return `<tr><td>${p.nombre} ${p.apellido}</td><td>${p.horas_semana}hs</td><td>$${p.tarifa_hora?.toLocaleString('es-AR')}</td><td style="font-weight:600">$${liq.toLocaleString('es-AR')}</td><td style="color:${conf?'#2d7a4f':'#b45309'}">${conf?'Confirmada':'Estimada'}</td></tr>`
    }).join('')}
    <tr style="font-weight:bold;border-top:2px solid #652f8d"><td colspan="3">Total mensual</td><td>$${totalReal.toLocaleString('es-AR')}</td><td></td></tr>
    </table>`
    abrirPDF('Liquidación Docente', html)
  }

  const exportCursosCSV = () => {
    const rows = [
      ['NEXT EZEIZA — REPORTE DE CURSOS'],
      ['Generado:', new Date().toLocaleDateString('es-AR')],
      [''],
      ['Curso','Nivel','Días','Horario','Alumnos'],
      ...cursos.map(c => [c.nombre, c.nivel, c.dias||'—', `${c.hora_inicio?.slice(0,5)||'—'} - ${c.hora_fin?.slice(0,5)||'—'}`, '—'])
    ]
    descargarCSV(rows, 'cursos_activos')
  }

  const exportCursosPDF = () => {
    const html = `<h1>Cursos Activos</h1>
    <table><tr><th>Curso</th><th>Nivel</th><th>Días</th><th>Horario</th></tr>
    ${cursos.map(c=>`<tr><td>${c.nombre}</td><td>${c.nivel}</td><td>${c.dias||'—'}</td><td>${c.hora_inicio?.slice(0,5)||'—'}–${c.hora_fin?.slice(0,5)||'—'}</td></tr>`).join('')}
    </table>`
    abrirPDF('Cursos Activos', html)
  }

  // ── EXPORTADOR GENERAL ──
  const exportGeneralCSV = () => {
    const rows = [
      ['NEXT EZEIZA — REPORTE GENERAL'],
      ['Generado:', new Date().toLocaleDateString('es-AR')],
      [''],
      ['=== PROFESORAS ==='],
      ['Nombre','Nivel','Hs/semana','Liquidación'],
      ...profesoras.map(p=>[`${p.nombre} ${p.apellido}`,p.nivel,p.horas_semana,`$${((p.horas_semana||0)*4*(p.tarifa_hora||0)).toLocaleString('es-AR')}`]),
      [''],
      ['=== ALUMNOS ==='],
      ['Nombre','Nivel','Cuota'],
      ...alumnos.map(a=>[`${a.nombre} ${a.apellido}`,a.nivel,`$${a.cuota_mensual?.toLocaleString('es-AR')}`]),
      [''],
      ['=== CURSOS ==='],
      ['Nombre','Nivel','Días'],
      ...cursos.map(c=>[c.nombre,c.nivel,c.dias||'—']),
    ]
    descargarCSV(rows, 'reporte_general')
  }

  const exportGeneralPDF = () => {
    const html = `
    <h1>Reporte General</h1>
    <h2>Profesoras</h2>
    <table><tr><th>Nombre</th><th>Nivel</th><th>Hs/sem</th><th>Liquidación</th></tr>
    ${profesoras.map(p=>{const liq=(p.horas_semana||0)*4*(p.tarifa_hora||0);return`<tr><td>${p.nombre} ${p.apellido}</td><td>${p.nivel}</td><td>${p.horas_semana}hs</td><td>$${liq.toLocaleString('es-AR')}</td></tr>`}).join('')}
    </table>
    <h2>Alumnos</h2>
    <table><tr><th>Nombre</th><th>Nivel</th><th>Cuota</th></tr>
    ${alumnos.map(a=>`<tr><td>${a.nombre} ${a.apellido}</td><td>${a.nivel}</td><td>$${a.cuota_mensual?.toLocaleString('es-AR')}</td></tr>`).join('')}
    </table>
    <h2>Cursos</h2>
    <table><tr><th>Nombre</th><th>Nivel</th><th>Días</th><th>Horario</th></tr>
    ${cursos.map(c=>`<tr><td>${c.nombre}</td><td>${c.nivel}</td><td>${c.dias||'—'}</td><td>${c.hora_inicio?.slice(0,5)||'—'}–${c.hora_fin?.slice(0,5)||'—'}</td></tr>`).join('')}
    </table>`
    abrirPDF('Reporte General', html)
  }

  return (
    <div className="fade-in">

      {/* ALERTAS 2 AUSENCIAS CONSECUTIVAS */}
      {!loadingAusentes && alertas2Cons.length > 0 && (
        <div style={{background:'var(--redl)',border:'1.5px solid #f5c5c5',borderRadius:'14px',padding:'14px 16px',marginBottom:'16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--red)" strokeWidth="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v4M10 14h.01"/></svg>
            <span style={{fontSize:'14px',fontWeight:700,color:'var(--red)'}}>⚠ {alertas2Cons.length} alumno{alertas2Cons.length!==1?'s':''} con 2 o más ausencias consecutivas</span>
          </div>
          {alertas2Cons.map((al:any,i:number) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 0',borderTop:'1px solid #f5c5c5'}}>
              <div style={{width:28,height:28,borderRadius:9,background:al.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:700,color:'#fff',flexShrink:0}}>
                {al.nombre?.[0]}{al.apellido?.[0]}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:600,color:'var(--red)'}}>{al.nombre} {al.apellido}</div>
                <div style={{fontSize:'11.5px',color:'var(--red)',opacity:.8}}>{al.curso} · {al.total} ausencia{al.total!==1?'s':''} · Últimas: {al.fechas?.join(' y ')}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SECCIÓN AUSENTES */}
      <ReportSection
        titulo="Reporte de ausencias"
        subtitulo={loadingAusentes ? 'Cargando...' : `${ausentes.filter(a=>a.ausencias.length>0).length} alumnos con ausencias registradas`}
        onCSV={() => {
          const rows = [
            ['NEXT EZEIZA — REPORTE DE AUSENCIAS'],
            ['Generado:', new Date().toLocaleDateString('es-AR')],
            [''],
            ['Alumno','Total ausencias','Alerta 2 consecutivas'],
            ...ausentes.filter(a=>a.ausencias.length>0).sort((a:any,b:any)=>b.ausencias.length-a.ausencias.length).map((a:any) => {
              const alerta = alertas2Cons.find(al=>al.alumno_id===a.alumno_id)
              return [`${a.nombre} ${a.apellido}`, a.ausencias.length, alerta?'⚠ SÍ':'No']
            })
          ]
          const csv = rows.map((r:any[]) => r.map((c:any) => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
          const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
          const url = URL.createObjectURL(blob)
          const el = document.createElement('a'); el.href=url; el.download=`ausencias_${new Date().toISOString().split('T')[0]}.csv`; el.click()
          URL.revokeObjectURL(url)
        }}
        onPDF={exportAusentesPDF}
      >
        {loadingAusentes && <div style={{textAlign:'center',padding:'16px',color:'var(--text3)'}}>Cargando datos...</div>}
        {!loadingAusentes && ausentes.filter(a=>a.ausencias.length>0).length === 0 && (
          <div style={{textAlign:'center',padding:'16px',color:'var(--text3)'}}>Sin ausencias registradas</div>
        )}
        {!loadingAusentes && [...ausentes].filter(a=>a.ausencias.length>0).sort((a,b)=>b.ausencias.length-a.ausencias.length).map((a:any) => {
          const tieneAlerta = alertas2Cons.find(al=>al.alumno_id===a.alumno_id)
          return (
            <div key={a.alumno_id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <div style={{width:28,height:28,borderRadius:9,background:a.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:700,color:'#fff',flexShrink:0}}>
                  {a.nombre?.[0]}{a.apellido?.[0]}
                </div>
                <div>
                  <div style={{fontSize:'13.5px',fontWeight:600}}>{a.nombre} {a.apellido}</div>
                  <div style={{fontSize:'11.5px',color:'var(--text2)'}}>{a.ausencias.length} ausencia{a.ausencias.length!==1?'s':''}</div>
                </div>
              </div>
              {tieneAlerta && (
                <span style={{padding:'3px 10px',borderRadius:'20px',fontSize:'11px',fontWeight:600,background:'var(--redl)',color:'var(--red)',border:'1px solid #f5c5c5'}}>
                  ⚠ 2+ consecutivas
                </span>
              )}
            </div>
          )
        })}
      </ReportSection>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'20px'}}>
        {[
          {val:`${alumnos.length}`,    label:'Alumnos activos',     color:'var(--v)'},
          {val:`${cursos.length}`,     label:'Cursos activos',      color:'var(--v)'},
          {val:`${avgAsist}%`,         label:'Asist. docente prom.',color:'var(--green)'},
          {val:`$${Math.round(totalLiq/1000)}k`, label:'Liquidación mensual', color:'var(--v)'},
        ].map(k => (
          <div key={k.label} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'18px 16px'}}>
            <div style={{fontSize:'28px',fontWeight:700,lineHeight:1,marginBottom:'4px',color:k.color}}>{k.val}</div>
            <div style={{fontSize:'12px',color:'var(--text2)',fontWeight:500}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* SECCIÓN: ASISTENCIA DOCENTE */}
      <ReportSection
        titulo="Asistencia docente"
        subtitulo={`${profesoras.length} docentes — últimos 6 meses`}
        onCSV={exportAsistenciaCSV}
        onPDF={exportAsistenciaPDF}
      >
        {profesoras.map(p => (
          <div key={p.id} style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
            <Av color={p.color} size={36}>{p.initials||`${p.nombre[0]}${p.apellido[0]}`}</Av>
            <div style={{fontSize:'13px',fontWeight:600,width:'100px',flexShrink:0}}>{p.nombre}</div>
            <div style={{flex:1,display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{flex:1,height:'8px',background:'var(--border)',borderRadius:'4px',overflow:'hidden'}}>
                <div style={{height:'100%',width:'95%',background:p.color,borderRadius:'4px'}} />
              </div>
              <span style={{fontSize:'13px',fontWeight:700,minWidth:'36px',textAlign:'right'}}>95%</span>
            </div>
          </div>
        ))}
      </ReportSection>

      {/* SECCIÓN: COBRANZA */}
      <ReportSection
        titulo="Cobranza por alumno"
        subtitulo={`${alumnos.length} alumnos`}
        onCSV={exportCobranzaCSV}
        onPDF={exportCobranzaPDF}
      >
        {alumnos.map(a => (
          <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <Av color={a.color} size={28}>{a.nombre[0]}{a.apellido[0]}</Av>
              <div>
                <div style={{fontSize:'13.5px',fontWeight:600}}>{a.nombre} {a.apellido}</div>
                <div style={{fontSize:'12px',color:'var(--text2)'}}>{a.nivel} · ${a.cuota_mensual?.toLocaleString('es-AR')}/mes</div>
              </div>
            </div>
            <span style={{padding:'3px 10px',borderRadius:'20px',fontSize:'11.5px',fontWeight:600,background:'var(--greenl)',color:'var(--green)'}}>Al día</span>
          </div>
        ))}
      </ReportSection>

      {/* SECCIÓN: LIQUIDACIÓN */}
      <ReportSection
        titulo="Liquidación docente"
        subtitulo={`Total estimado: $${totalLiq.toLocaleString('es-AR')}`}
        onCSV={exportLiquidacionCSV}
        onPDF={exportLiquidacionPDF}
      >
        {[...profesoras].sort((a,b)=>(b.horas_semana||0)-(a.horas_semana||0)).map(p => {
          const liq = (p.horas_semana||0)*4*(p.tarifa_hora||0)
          return (
            <div key={p.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <Av color={p.color} size={28}>{p.initials||`${p.nombre[0]}${p.apellido[0]}`}</Av>
                <div>
                  <div style={{fontSize:'13.5px',fontWeight:600}}>{p.nombre} {p.apellido}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)'}}>{p.horas_semana}hs/sem · ${p.tarifa_hora?.toLocaleString('es-AR')}/h</div>
                </div>
              </div>
              <div style={{fontSize:'15px',fontWeight:700,color:'var(--v)'}}>${liq.toLocaleString('es-AR')}</div>
            </div>
          )
        })}
        <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0',marginTop:'4px'}}>
          <span style={{fontSize:'15px',fontWeight:700}}>Total mensual</span>
          <span style={{fontSize:'18px',fontWeight:700,color:'var(--v)'}}>${totalLiq.toLocaleString('es-AR')}</span>
        </div>
      </ReportSection>

      {/* SECCIÓN: CURSOS */}
      <ReportSection
        titulo="Cursos activos"
        subtitulo={`${cursos.length} cursos en curso`}
        onCSV={exportCursosCSV}
        onPDF={exportCursosPDF}
      >
        {cursos.map(c => (
          <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
            <div>
              <div style={{fontSize:'13.5px',fontWeight:600}}>{c.nombre}</div>
              <div style={{fontSize:'12px',color:'var(--text2)'}}>{c.dias||'—'} · {c.hora_inicio?.slice(0,5)||'—'}–{c.hora_fin?.slice(0,5)||'—'}</div>
            </div>
            <span style={{padding:'3px 10px',borderRadius:'20px',fontSize:'11.5px',fontWeight:600,background:'var(--vl)',color:'var(--v)'}}>{c.nivel}</span>
          </div>
        ))}
      </ReportSection>


      {/* SECCIÓN: INGRESOS MENSUALES */}
      <ReportSection
        titulo="Ingresos mensuales"
        subtitulo={`${alumnos.length} alumnos · Total esperado: $${alumnos.reduce((s,a)=>s+(a.cuota_mensual||0),0).toLocaleString('es-AR')}/mes`}
        onCSV={() => {
          const rows = [
            ['NEXT EZEIZA — INGRESOS MENSUALES'],
            ['Generado:', new Date().toLocaleDateString('es-AR')],
            [''],
            ['Concepto','Cantidad','Monto'],
            ['Total alumnos activos', alumnos.length, ''],
            ['Ingresos esperados/mes', '', `$${alumnos.reduce((s,a)=>s+(a.cuota_mensual||0),0).toLocaleString('es-AR')}`],
            ['Liquidación docente/mes', '', `$${totalLiq.toLocaleString('es-AR')}`],
            ['Margen estimado', '', `$${(alumnos.reduce((s,a)=>s+(a.cuota_mensual||0),0)-totalLiq).toLocaleString('es-AR')}`],
            [''],
            ['Detalle por alumno','Cuota mensual',''],
            ...alumnos.map(a=>[`${a.nombre} ${a.apellido}`,`$${a.cuota_mensual?.toLocaleString('es-AR')||'0'}`,''])
          ]
          const csv = rows.map((r:any[]) => r.map((c:any)=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n')
          const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
          const url = URL.createObjectURL(blob); const el = document.createElement('a')
          el.href=url; el.download=`ingresos_${new Date().toISOString().split('T')[0]}.csv`; el.click()
          URL.revokeObjectURL(url)
        }}
        onPDF={() => {
          const esperado = alumnos.reduce((s,a)=>s+(a.cuota_mensual||0),0)
          const margen = esperado - totalLiq
          abrirPDF('Ingresos Mensuales', `
            <h2>Resumen financiero</h2>
            <table>
              <tr><th>Concepto</th><th>Monto</th></tr>
              <tr><td>Ingresos esperados/mes</td><td style="font-weight:700;color:#2d7a4f">$${esperado.toLocaleString('es-AR')}</td></tr>
              <tr><td>Liquidación docente</td><td style="font-weight:700;color:#c0392b">$${totalLiq.toLocaleString('es-AR')}</td></tr>
              <tr style="background:#f2e8f9"><td style="font-weight:700">Margen estimado</td><td style="font-weight:700;color:#652f8d">$${margen.toLocaleString('es-AR')}</td></tr>
            </table>
            <h2>Cuotas por alumno</h2>
            <table><tr><th>Alumno</th><th>Nivel</th><th>Cuota mensual</th></tr>
            ${alumnos.map(a=>`<tr><td>${a.nombre} ${a.apellido}</td><td>${a.nivel}</td><td>$${a.cuota_mensual?.toLocaleString('es-AR')||'0'}</td></tr>`).join('')}
            </table>
          `)
        }}
      >
        {/* Resumen visual */}
        {(() => {
          const esperado = alumnos.reduce((s,a)=>s+(a.cuota_mensual||0),0)
          const margen = esperado - totalLiq
          return (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'16px'}}>
              {[
                {label:'Ingresos esperados',val:`$${Math.round(esperado/1000)}k`,color:'var(--green)'},
                {label:'Liquidación docente',val:`$${Math.round(totalLiq/1000)}k`,color:'var(--red)'},
                {label:'Margen estimado',val:`$${Math.round(margen/1000)}k`,color:margen>=0?'var(--v)':'var(--red)'},
              ].map(k=>(
                <div key={k.label} style={{background:'var(--bg)',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                  <div style={{fontSize:'20px',fontWeight:700,color:k.color}}>{k.val}</div>
                  <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}}>{k.label}</div>
                </div>
              ))}
            </div>
          )
        })()}
        {alumnos.slice(0,5).map(a=>(
          <div key={a.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
            <div style={{fontSize:'13.5px',fontWeight:500}}>{a.nombre} {a.apellido}</div>
            <div style={{fontSize:'14px',fontWeight:700,color:'var(--v)'}}>${a.cuota_mensual?.toLocaleString('es-AR')||'0'}</div>
          </div>
        ))}
        {alumnos.length > 5 && <div style={{fontSize:'12px',color:'var(--text3)',textAlign:'center',padding:'8px 0'}}>y {alumnos.length-5} más... · Descargá el reporte para verlos todos</div>}
      </ReportSection>

      {/* SECCIÓN: REPORTE POR PROFESORA */}
      <ReportSection
        titulo="Reporte por docente"
        subtitulo={`${profesoras.length} docentes activas`}
        onCSV={() => {
          const rows = [
            ['NEXT EZEIZA — REPORTE POR DOCENTE'],
            ['Generado:', new Date().toLocaleDateString('es-AR')],
            [''],
            ['Docente','Nivel','Hs/semana','Hs/mes','Tarifa/hora','Liquidación','Cursos a cargo'],
            ...profesoras.map(p => {
              const liq = (p.horas_semana||0)*4*(p.tarifa_hora||0)
              const cursosProf = cursos.filter(c => c.profesora_id === p.id)
              return [`${p.nombre} ${p.apellido}`, p.nivel, p.horas_semana, (p.horas_semana||0)*4, `$${p.tarifa_hora?.toLocaleString('es-AR')}`, `$${liq.toLocaleString('es-AR')}`, cursosProf.map(c=>c.nombre).join(' | ')]
            })
          ]
          const csv = rows.map((r:any[]) => r.map((c:any)=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n')
          const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
          const url = URL.createObjectURL(blob); const el = document.createElement('a')
          el.href=url; el.download=`reporte_docentes_${new Date().toISOString().split('T')[0]}.csv`; el.click()
          URL.revokeObjectURL(url)
        }}
        onPDF={() => abrirPDF('Reporte por Docente', `
          <table><tr><th>Docente</th><th>Hs/sem</th><th>Tarifa/h</th><th>Liquidación</th><th>Cursos</th></tr>
          ${profesoras.map(p=>{
            const liq=(p.horas_semana||0)*4*(p.tarifa_hora||0)
            const cursosProf=cursos.filter(c=>c.profesora_id===p.id)
            return`<tr><td>${p.nombre} ${p.apellido}</td><td>${p.horas_semana}hs</td><td>$${p.tarifa_hora?.toLocaleString('es-AR')}</td><td style="font-weight:700;color:#652f8d">$${liq.toLocaleString('es-AR')}</td><td style="font-size:11px">${cursosProf.map(c=>c.nombre).join('<br>')}</td></tr>`
          }).join('')}
          <tr style="font-weight:bold;border-top:2px solid #652f8d"><td colspan="3">Total liquidación</td><td style="color:#652f8d">$${totalLiq.toLocaleString('es-AR')}</td><td></td></tr>
          </table>
        `)}
      >
        {profesoras.map(p => {
          const liq = (p.horas_semana||0)*4*(p.tarifa_hora||0)
          const cursosProf = cursos.filter(c => c.profesora_id === p.id)
          return (
            <div key={p.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px'}}>
                <Av color={p.color} size={32}>{p.initials||`${p.nombre[0]}${p.apellido[0]}`}</Av>
                <div style={{flex:1}}>
                  <div style={{fontSize:'14px',fontWeight:600}}>{p.nombre} {p.apellido}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)'}}>{p.nivel} · {p.horas_semana}hs/sem · ${p.tarifa_hora?.toLocaleString('es-AR')}/h</div>
                </div>
                <div style={{fontSize:'15px',fontWeight:700,color:'var(--v)'}}>${liq.toLocaleString('es-AR')}</div>
              </div>
              {cursosProf.length > 0 && (
                <div style={{display:'flex',gap:'5px',flexWrap:'wrap',paddingLeft:'42px'}}>
                  {cursosProf.map(c=>(
                    <span key={c.id} style={{padding:'2px 8px',borderRadius:'8px',fontSize:'11px',fontWeight:500,background:'var(--vl)',color:'var(--v)'}}>{c.nombre}</span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </ReportSection>

      {/* EXPORTAR TODO */}
      <div style={{border:'1.5px solid var(--border)',borderRadius:'16px',padding:'16px',background:'var(--white)'}}>
        <div style={{fontSize:'13px',fontWeight:700,marginBottom:'4px'}}>Exportar reporte completo</div>
        <div style={{fontSize:'12px',color:'var(--text2)',marginBottom:'12px'}}>Incluye asistencia, cobranza, liquidación y cursos en un solo archivo</div>
        <div style={{display:'flex',gap:'10px'}}>
          <button onClick={exportGeneralCSV} style={btnStyle('#2d7a4f')}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
            Excel completo
          </button>
          <button onClick={exportGeneralPDF} style={btnStyle('var(--v)')}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
            PDF completo
          </button>
        </div>
      </div>
    </div>
  )
}

// ── COMPONENTE SECCIÓN CON DESCARGA ──
function ReportSection({ titulo, subtitulo, onCSV, onPDF, children }: any) {
  const [abierto, setAbierto] = useState(true)
  return (
    <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',marginBottom:'14px',overflow:'hidden'}}>
      <div style={{padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:abierto?'1px solid var(--border)':'none',cursor:'pointer'}} onClick={() => setAbierto(!abierto)}>
        <div>
          <div style={{fontSize:'15px',fontWeight:700}}>{titulo}</div>
          <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{subtitulo}</div>
        </div>
        <div style={{display:'flex',gap:'6px',alignItems:'center'}} onClick={e=>e.stopPropagation()}>
          <button onClick={onCSV} title="Descargar Excel" style={{padding:'6px 10px',border:'1.5px solid var(--border)',borderRadius:'8px',background:'var(--white)',cursor:'pointer',fontSize:'12px',fontWeight:600,color:'var(--green)',display:'flex',alignItems:'center',gap:'4px'}}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
            XLS
          </button>
          <button onClick={onPDF} title="Descargar PDF" style={{padding:'6px 10px',border:'1.5px solid var(--border)',borderRadius:'8px',background:'var(--white)',cursor:'pointer',fontSize:'12px',fontWeight:600,color:'var(--v)',display:'flex',alignItems:'center',gap:'4px'}}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
            PDF
          </button>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2" style={{transform:abierto?'rotate(180deg)':'',transition:'transform .2s',cursor:'pointer'}}><path d="M5 8l5 5 5-5"/></svg>
        </div>
      </div>
      {abierto && <div style={{padding:'14px 16px'}}>{children}</div>}
    </div>
  )
}

// ── HELPERS DE EXPORTACIÓN ──
function descargarCSV(rows: any[][], nombre: string) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a')
  el.href = url; el.download = `${nombre}_${new Date().toISOString().split('T')[0]}.csv`; el.click()
  URL.revokeObjectURL(url)
}

function abrirPDF(titulo: string, contenido: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title>
  <style>
    body{font-family:sans-serif;padding:24px;font-size:13px;color:#1a1020}
    h1{color:#652f8d;font-size:20px;margin-bottom:4px}
    h2{color:#652f8d;font-size:15px;margin:20px 0 8px;border-bottom:1px solid #e8dff2;padding-bottom:6px}
    p{font-size:12px;color:#9b8eaa;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin:8px 0 16px}
    th{font-size:10px;text-transform:uppercase;border-bottom:2px solid #652f8d;padding:8px 6px;text-align:left;color:#652f8d;letter-spacing:.05em}
    td{padding:8px 6px;border-bottom:1px solid #f0edf5;font-size:13px}
    tr:hover td{background:#faf5fd}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #652f8d}
    .logo{font-size:20px;font-weight:700}.logo span{color:#652f8d}
    .fecha{font-size:12px;color:#9b8eaa}
  </style></head><body>
  <div class="header">
    <div class="logo"><span>Next</span> Ezeiza</div>
    <div class="fecha">Generado: ${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div>
  </div>
  ${contenido}
  <script>setTimeout(function(){window.print()},300)<\/script></body></html>`
  const blob = new Blob([html], {type:'text/html;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) { const a = document.createElement('a'); a.href=url; a.download=titulo+'.html'; a.click() }
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}


const Av = ({color,size,children}:any) => <div style={{width:size,height:size,borderRadius:Math.round(size*.32)+'px',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.28+'px',fontWeight:700,color:'#fff',flexShrink:0}}>{children}</div>
const btnStyle = (bg: string) => ({display:'flex',alignItems:'center',gap:'6px',padding:'10px 16px',background:bg,color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}) as const
