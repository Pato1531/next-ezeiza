'use client'
import { useState } from 'react'
import { useComunicados } from '@/lib/hooks'
import { useAuth } from '@/lib/auth-context'

const ROL_DESTINO = [
  { value: 'todos',         label: 'Todos' },
  { value: 'coordinadora',  label: 'Coordinadoras' },
  { value: 'secretaria',    label: 'Secretarias' },
  { value: 'profesora',     label: 'Profesoras' },
]

export default function Comunicados() {
  const { comunicados, loading, agregar, eliminar } = useComunicados()
  const { usuario } = useAuth()
  const [modalNuevo, setModalNuevo] = useState(false)
  const [form, setForm] = useState({ titulo:'', contenido:'', rol_destino:'todos' })
  const [guardando, setGuardando] = useState(false)

  const esDirector = usuario?.rol === 'director'

  // Filtrar comunicados según el rol del usuario
  const misComunicados = comunicados.filter(c =>
    c.rol_destino === 'todos' || c.rol_destino === usuario?.rol
  )

  const crear = async () => {
    if (!form.titulo || !form.contenido) return alert('Título y contenido son obligatorios')
    setGuardando(true)
    await agregar({
      ...form,
      autor_id: usuario?.id,
      autor_nombre: usuario?.nombre,
    })
    setGuardando(false)
    setModalNuevo(false)
    setForm({ titulo:'', contenido:'', rol_destino:'todos' })
  }

  // Sin bloqueo de loading

  return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:700}}>Comunicados</div>
          <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'2px'}}>{misComunicados.length} activos</div>
        </div>
        {esDirector && <BtnP sm onClick={() => setModalNuevo(true)}>+ Nuevo comunicado</BtnP>}
      </div>

      {misComunicados.length === 0 && (
        <div style={{textAlign:'center',padding:'48px 24px',color:'var(--text3)',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px'}}>
          <div style={{fontSize:'36px',marginBottom:'10px'}}>📢</div>
          <div style={{fontSize:'15px',fontWeight:600,color:'var(--text2)',marginBottom:'4px'}}>Sin comunicados</div>
          <div style={{fontSize:'13px'}}>Los comunicados del director aparecerán acá.</div>
        </div>
      )}

      {misComunicados.map(c => {
        const fecha = new Date(c.created_at)
        const destino = ROL_DESTINO.find(r => r.value === c.rol_destino)
        return (
          <div key={c.id} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'18px',marginBottom:'12px'}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',marginBottom:'10px'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:'16px',fontWeight:700,marginBottom:'3px'}}>{c.titulo}</div>
                <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:'12px',color:'var(--text3)'}}>
                    {c.autor_nombre} · {fecha.toLocaleDateString('es-AR',{day:'numeric',month:'long'})}
                  </span>
                  <span style={{padding:'2px 8px',borderRadius:'10px',fontSize:'11px',fontWeight:600,background:'var(--vl)',color:'var(--v)'}}>
                    Para: {destino?.label||'Todos'}
                  </span>
                </div>
              </div>
              {esDirector && (
                <button onClick={() => eliminar(c.id)} style={{padding:'5px 10px',background:'var(--redl)',color:'var(--red)',border:'1px solid #f5c5c5',borderRadius:'8px',fontSize:'11px',fontWeight:600,cursor:'pointer',flexShrink:0}}>
                  Eliminar
                </button>
              )}
            </div>
            <div style={{fontSize:'14px',color:'var(--text)',lineHeight:1.6,background:'var(--bg)',borderRadius:'10px',padding:'12px'}}>
              {c.contenido}
            </div>
          </div>
        )
      })}

      {modalNuevo && (
        <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={e=>{if(e.target===e.currentTarget)setModalNuevo(false)}}>
          <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'28px 20px 32px',width:'100%',maxWidth:'480px',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 20px'}} />
            <div style={{fontSize:'18px',fontWeight:700,marginBottom:'20px'}}>Nuevo comunicado</div>
            <Field2 label="Título">
              <input value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} style={IS} placeholder="Ej: Reunión de equipo este viernes" />
            </Field2>
            <Field2 label="Contenido">
              <textarea value={form.contenido} onChange={e=>setForm({...form,contenido:e.target.value})}
                style={{...IS,resize:'none',lineHeight:1.5}} rows={5} placeholder="Escribí el comunicado acá..." />
            </Field2>
            <Field2 label="Destinatarios">
              <select style={IS} value={form.rol_destino} onChange={e=>setForm({...form,rol_destino:e.target.value})}>
                {ROL_DESTINO.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field2>
            <div style={{display:'flex',gap:'10px',marginTop:'8px'}}>
              <BtnG style={{flex:1}} onClick={() => setModalNuevo(false)}>Cancelar</BtnG>
              <BtnP style={{flex:2}} onClick={crear} disabled={guardando}>{guardando?'Publicando...':'Publicar'}</BtnP>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const
const Loader = () => <div style={{color:'var(--text3)',padding:'24px',textAlign:'center'}}>Cargando...</div>
const BtnP = ({children,sm,onClick,style,disabled}:any) => <button onClick={onClick} disabled={disabled} style={{padding:sm?'9px 14px':'12px 20px',background:disabled?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:disabled?'not-allowed':'pointer',...style}}>{children}</button>
const BtnG = ({children,sm,onClick,style}:any) => <button onClick={onClick} style={{padding:sm?'9px 14px':'12px 20px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:'pointer',...style}}>{children}</button>
const Field2 = ({label,children}:any) => <div style={{marginBottom:'11px'}}><div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>{label}</div>{children}</div>
