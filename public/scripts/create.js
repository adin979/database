import customFetch from "./customFetch.js"

export default function create(){
    document.querySelector('#dbForm').addEventListener('submit',(e)=>{
        e.preventDefault()
        const dbName=e.target.elements.dbname.value
        return customFetch('/api/databases',{
                method:'POST',
                body:{dbName:dbName}
            })
            .then(response=>response.json())
            .then(result=>{
                console.log(result)
                if(!result.data)alert('gagal!',result)
                localStorage.setItem('dbName',result.data.name)
                alert('data berhasil disimpan!')
            })
            .catch(error=>error)
        })

        const colinput=document.querySelector('#tabelinput').getElementsByTagName('tbody')[0]

        colinput.addEventListener('keydown',(e)=>{
            if(e.key === 'Enter'&& e.target.tagName === 'INPUT'){
                const currentInput = e.target
                const currentTd = currentInput.closest('td')
                const currentTr = currentInput.closest('tr')
                const cells = Array.from(currentTr.cells)
                const currentCellIndex = cells.indexOf(currentTd)
                const nextTd = cells[currentCellIndex +1]
                if(nextTd&&nextTd.querySelector('input')){
                    nextTd.querySelector('input').focus()
                }
                else{
                    const nextTr=currentTr.nextElementSibling
                    if(nextTr&&nextTr.querySelector('input')){
                        nextTr.querySelector('input').focus()
                    }else{
                        document.querySelector('#create').focus()
                    }
                }
            }
        })
        
        const fields=[
            {key:'name',tag:'input',type:'text',require:true},
            {key:'type',tag:'select',options:['INT', 'VARCHAR(255)', 'TEXT', 'BOOLEAN', 'DATE', 'TIMESTAMP']},
            {key:'req',tag:'input',type:'checkbox',value:true},
            {key:'uniq',tag:'input',type:'checkbox',value:true},
            {key:'pk',tag:'input',type:'checkbox',value:true},
            {key:'ai',tag:'input',type:'checkbox',value:true}
        ]
        const inputCount=(count)=>{
            colinput.innerHTML=''
            for (let i = 0; i < count; i++) {
                const newRow=colinput.insertRow()
                fields.forEach((field,index)=>{
                    const cell=newRow.insertCell(index)
                    const element=document.createElement(field.tag)
                    element.id=`${field.key}_${i+1}`
                    element.name=`${field.key}_${i+1}`
                    if(field.tag === 'select'){
                        field.options.forEach(opt=>{
                            const option=document.createElement('option')
                            option.value=opt
                            option.textContent=opt
                            element.appendChild(option)
                        })
                    }else{
                        element.type=field.type
                    }
                    cell.appendChild(element)
                })
            }
        }
        inputCount(1)
        const tableForm=document.querySelector('#table-form')
        const btnConfirm =tableForm.elements.confirm
        btnConfirm.addEventListener('click',()=>inputCount(tableForm.elements.colcount.value))
        tableForm.addEventListener('submit',async(e)=>{
            e.preventDefault();
            const tabelData= new FormData(e.target)
            const data = Object.fromEntries(tabelData.entries())
            const colData = []
            for (let i = 0; i < data.colcount ; i++) {
                colData.push({
                    name:data[`name_${i+1}`],
                    type:data[`type_${i+1}`],
                    req:e.target.elements[`req_${i+1}`].checked,
                    uniq:e.target.elements[`uniq_${i+1}`].checked,
                    pk:e.target.elements[`pk_${i+1}`].checked,
                    ai:e.target.elements[`ai_${i+1}`].checked,
                })
            }
            console.log(colData)
            const dbName=localStorage.getItem('dbName')
            try{
                const response = await customFetch(`/api/db/${dbName}/tables`,{
                    method:'POST',
                    body:JSON.stringify({tableName:data.tablename})
                })
                if(!response.ok){alert('Tabel gagal dibuat');return}
                
                try {
                    const result = await customFetch(`/api/db/${dbName}/table/${data.tablename}/cols`,{
                        method:'POST',
                        headers:{
                            'Content-type':'application/json',
                            'Authorization':`Bearer ${localStorage.getItem('token')}`
                        },
                        body:colData
                    })
                    if(!result.ok)return alert('Gagal menyimpan')
                    alert('tabel dan kolom berhasil disimpan')
                        document.querySelector('#tablename').value=''
                        colinput.innerHTML=''
                        inputCount(1)
                        document.querySelector('#tablename').focus()
                } catch (error) {console.error('Terjadi kesalahan server',error.message)}
            }catch(error){console.error('Terjadi kesalahan server',error.message)}
        })
    }
