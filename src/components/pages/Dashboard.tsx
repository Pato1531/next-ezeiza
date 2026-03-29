'use client'
import { useAuth } from '@/lib/auth-context'
import { useAlumnos, useProfesoras, useCursos } from '@/lib/hooks'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function Dashboard() {
  const { usuario } = useAuth()
  const { alumnos, loading: loadA } = useAlumnos()
  const { profesoras } = useProfesoras()
  const { cursos } = useCursos()

  const today = new Date()
  const diasJS = ['','Lunes','Martes','Miercoles','Jueves','Viernes','Sabados']
  const diaHoy = diasJS[today.getDay()] || ''

  const NIVEL_COL: Record<string,{bg:string,text:string}> = {
    'Básico':     {bg:'#FEF3CD',text:'#b45309'},
    'Intermedio': {bg:'#E0F0F7',text:'#1a6b8a'},
    'Advanced':   {bg:'#e6f4ec',text:'#2d7a4f'},
    'Cambridge':  {bg:'#f2e8f9',text:'#652f8d'},
  }

  const cursosHoy = cursos.filter(c => {
    const d = c.dias || ''
    return d.toLowerCase().includes(diaHoy.toLowerCase().slice(0,3))
  }).sort((a:any,b:any) => (a.hora_inicio||'').localeCompare(b.hora_inicio||''))

  if (loadA) return <div style={{color:'var(--text3)',padding:'24px',textAlign:'center'}}>Cargando...</div>

  return (
    <div className="fade-in">
      <div style={{marginBottom:'20px'}}>
        <div style={{fontSize:'13px',color:'var(--text2)',fontWeight:500}}>Hola, {usuario?.nombre?.split(' ')[0]} 👋</div>
        <div style={{fontSize:'22px',fontWeight:700,letterSpacing:'-.3px',marginTop:'2px'}}>
          {today.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'18px'}}>
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'18px 16px'}}>
          <div style={{fontSize:'30px',fontWeight:700,lineHeight:1,marginBottom:'4px',color:'var(--v)'}}>{alumnos.length}</div>
          <div style={{fontSize:'12px',color:'var(--text2)',fontWeight:500}}>Alumnos activos</div>
        </div>
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'18px 16px'}}>
          <div style={{fontSize:'30px',fontWeight:700,lineHeight:1,marginBottom:'4px',color:'var(--v)'}}>{cursos.length}</div>
          <div style={{fontSize:'12px',color:'var(--text2)',fontWeight:500}}>Cursos activos</div>
        </div>
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'18px 16px'}}>
          <div style={{fontSize:'30px',fontWeight:700,lineHeight:1,marginBottom:'4px',color:'var(--v)'}}>{profesoras.length}</div>
          <div style={{fontSize:'12px',color:'var(--text2)',fontWeight:500}}>Docentes</div>
        </div>
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'18px 16px'}}>
          <div style={{fontSize:'30px',fontWeight:700,lineHeight:1,marginBottom:'4px',color:'var(--v)'}}>{cursosHoy.length}</div>
          <div style={{fontSize:'12px',color:'var(--text2)',fontWeight:500}}>Clases hoy</div>
        </div>
      </div>

      <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'10px'}}>
        {diaHoy ? `Clases de hoy · ${diaHoy}` : 'Clases del día'}
      </div>

      {cursosHoy.length === 0 ? (
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'20px',textAlign:'center',color:'var(--text3)',marginBottom:'18px'}}>
          {today.getDay() === 0 ? '🌅 Hoy es domingo' : 'No hay clases programadas para hoy'}
        </div>
      ) : (
        <div style={{marginBottom:'18px'}}>
          {cursosHoy.map((c:any) => {
            const prof = profesoras.find((p:any) => p.id === c.profesora_id)
            const col = NIVEL_COL[c.nivel] ?? NIVEL_COL['Básico']
            return (
              <div key={c.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 14px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',marginBottom:'8px'}}>
                <div style={{width:42,height:42,borderRadius:13,background:col.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <span style={{fontSize:'10px',fontWeight:700,color:col.text}}>{c.nivel.slice(0,3).toUpperCase()}</span>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'14px',fontWeight:600}}>{c.nombre}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>
                    {c.hora_inicio?.slice(0,5)||'—'}–{c.hora_fin?.slice(0,5)||'—'} · {prof ? prof.nombre : 'Sin asignar'}
                  </div>
                </div>
                <div style={{fontSize:'13px',fontWeight:700,color:'var(--v)',flexShrink:0}}>
                  {c.hora_inicio?.slice(0,5)||'—'}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'10px'}}>Todos los cursos</div>
      {cursos.map((c:any) => {
        const prof = profesoras.find((p:any) => p.id === c.profesora_id)
        const col = NIVEL_COL[c.nivel] ?? NIVEL_COL['Básico']
        return (
          <div key={c.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 14px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',marginBottom:'8px'}}>
            <div style={{width:42,height:42,borderRadius:13,background:col.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{fontSize:'10px',fontWeight:700,color:col.text}}>{c.nivel.slice(0,3).toUpperCase()}</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'14px',fontWeight:600}}>{c.nombre}</div>
              <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>
                {prof ? `${prof.nombre}` : 'Sin asignar'} · {c.dias||'—'} · {c.hora_inicio?.slice(0,5)||'—'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
