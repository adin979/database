import HomeView from './home.js'
import CreateView from './create.js'
import LoginView from './login.js'
import RegisterView from './register.js'

const appState={
    count:0
}

const routes={
    '/':HomeView,
    'create':CreateView,
    'login':LoginView,
    'register':RegisterView
}

class Router{
    constructor(routes,rootId){
        this.routes=routes
        this.rootEl=document.getElementById(rootId)
        
        window.addEventListener('hashchange',()=>this.render())
        window.addEventListener('DOMContentLoaded',()=>this.render())
    }
    getCurrentPath(){return window.location.pathname.slice(1)||'/'}
    async render(){
        const path = this.getCurrentPath()
        const view=this.routes[path]||{
            getTemplate:async()=>`<h1 class='page-title'>404</h1>`,
            init:()=>{}
        }
        document.querySelector('title').textContent=view.title
        this.rootEl.innerHTML=await view.getTemplate()
        view.init(this.rootEl,appState)
    }
}

const appRouter=new Router(routes,'App')