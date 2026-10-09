import Cocoa

final class Launcher: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var status: NSTextField!
    var service: Process?
    var installer: Process?
    var timer: Timer?
    var webURL: URL?
    var stopping = false
    var signals: [DispatchSourceSignal] = []
    let instance = UUID().uuidString
    var data: URL { if let custom = ProcessInfo.processInfo.environment["KK_APP_DATA_DIR"] { return URL(fileURLWithPath: custom) }; return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("KK-Tingjian") }
    var resources: URL { Bundle.main.resourceURL! }
    func applicationDidFinishLaunching(_ note: Notification) {
        if ProcessInfo.processInfo.environment["KK_APP_DATA_DIR"] == nil, let other = NSRunningApplication.runningApplications(withBundleIdentifier: "com.kk.tingjian.local").first(where: {$0.processIdentifier != ProcessInfo.processInfo.processIdentifier}) { other.activate(options: [.activateAllWindows]); NSApp.terminate(nil); return }
        for sig in [SIGTERM,SIGINT] { signal(sig,SIG_IGN); let source=DispatchSource.makeSignalSource(signal:sig,queue:.main); source.setEventHandler { RunLoop.main.perform { NSApp.terminate(nil) } }; source.resume(); signals.append(source) }
        buildWindow(); start()
    }
    func buildWindow() {
        let menu = NSMenu(); let item = NSMenuItem(); menu.addItem(item); let appMenu = NSMenu(); appMenu.addItem(withTitle: "退出 KK-听见", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"); item.submenu=appMenu; NSApp.mainMenu=menu
        window=NSWindow(contentRect: NSRect(x:0,y:0,width:620,height:540),styleMask:[.titled,.closable,.miniaturizable],backing:.buffered,defer:false)
        window.title="KK-听见 · 本地轻量版"; window.isReleasedWhenClosed=false; window.center()
        let content=NSStackView(); content.orientation = .vertical; content.alignment = .leading; content.spacing=14; content.edgeInsets=NSEdgeInsets(top:26,left:28,bottom:24,right:28); content.translatesAutoresizingMaskIntoConstraints=false
        window.contentView!.addSubview(content); NSLayoutConstraint.activate([content.leadingAnchor.constraint(equalTo:window.contentView!.leadingAnchor),content.trailingAnchor.constraint(equalTo:window.contentView!.trailingAnchor),content.topAnchor.constraint(equalTo:window.contentView!.topAnchor)])
        let title=NSTextField(labelWithString:"KK-听见"); title.font = .boldSystemFont(ofSize:30); title.textColor=NSColor.systemOrange; content.addArrangedSubview(title)
        let subtitle=NSTextField(wrappingLabelWithString:"评论洞察 · 视频采集 · 翻译 · 封面\n本机运行，数据保存在这台电脑。无需注册或订阅。"); subtitle.font = .systemFont(ofSize:14); content.addArrangedSubview(subtitle)
        status=NSTextField(wrappingLabelWithString:"正在准备工作台，首次启动可能需要半分钟…"); status.textColor = .secondaryLabelColor; status.font = .systemFont(ofSize:12); content.addArrangedSubview(status)
        let actions=NSStackView(); actions.orientation = .horizontal; actions.spacing=10
        actions.addArrangedSubview(button("打开工作台",#selector(openWorkbench))); actions.addArrangedSubview(button("数据文件夹",#selector(openData))); actions.addArrangedSubview(button("使用说明",#selector(openGuide))); content.addArrangedSubview(actions)
        content.addArrangedSubview(NSTextField(labelWithString:"按需安装 · 仅点击后联网下载"))
        content.addArrangedSubview(button("安装语音字幕组件与模型",#selector(installSpeech)))
        content.addArrangedSubview(button("安装封面智能排版模型",#selector(installDesign)))
        content.addArrangedSubview(button("安装增强采集（非商业学习用途）",#selector(installCollector)))
        let help=NSTextField(wrappingLabelWithString:"模板封面和画面文字识别已内置。语音字幕需下载模型，智能排版模型约数 GB。平台采集需安装 Google Chrome 并登录自己的账号。翻译和视频下载需要联网。\n\n关闭此窗口不停止服务；从菜单退出会停止本机任务。"); help.font = .systemFont(ofSize:12); help.textColor = .secondaryLabelColor; content.addArrangedSubview(help)
        window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
    }
    func button(_ title:String,_ action:Selector)->NSButton { let b=NSButton(title:title,target:self,action:action); b.bezelStyle = .rounded; return b }
    func baseEnvironment()->[String:String] { var env=ProcessInfo.processInfo.environment; env["KK_APP_DATA_DIR"]=data.path; env["KK_RESOURCES"]=resources.path; env["KK_DESKTOP_INSTANCE"]=instance; env["PATH"]="/usr/bin:/bin:/usr/sbin:/sbin"; env.removeValue(forKey:"NODE_OPTIONS"); return env }
    func start() {
        do {
            try FileManager.default.createDirectory(at:data,withIntermediateDirectories:true,attributes:[.posixPermissions:0o700])
            let log=data.appendingPathComponent("launcher.log"); if !FileManager.default.fileExists(atPath:log.path){FileManager.default.createFile(atPath:log.path,contents:nil)}
            let handle=try FileHandle(forWritingTo:log); try handle.seekToEnd()
            let p=Process(); p.executableURL=resources.appendingPathComponent("runtime/bin/node"); p.arguments=[resources.appendingPathComponent("desktop/bootstrap.mjs").path]; p.environment=baseEnvironment(); p.standardOutput=handle;p.standardError=handle
            p.terminationHandler={ [weak self] process in DispatchQueue.main.async { guard let self=self else{return}; self.timer?.invalidate(); if self.stopping {NSApp.reply(toApplicationShouldTerminate:true); exit(0)} else {self.status.stringValue="服务已停止。请退出后重新打开；详细原因见数据文件夹中的 launcher.log。"} }}
            try p.run(); service=p
            var attempts=0
            timer=Timer.scheduledTimer(withTimeInterval:0.4,repeats:true){[weak self] tick in guard let self=self else{return};attempts += 1
                if let bytes=try? Data(contentsOf:self.data.appendingPathComponent("session.json")), let state=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any], state["instance"] as? String == self.instance, let address=state["url"] as? String, let url=URL(string:address) {
                    tick.invalidate();self.webURL=url;self.status.stringValue="工作台已就绪 · 基础功能可离线使用";if ProcessInfo.processInfo.environment["KK_NO_BROWSER"] != "1" {self.openWorkbench()}
                } else if attempts>150 {tick.invalidate();self.status.stringValue="启动时间较长，请查看 launcher.log，或退出后重试。"}
            }
        } catch { status.stringValue="无法启动：\(error.localizedDescription)。请将应用复制到本机可读目录后重试。" }
    }
    @objc func openWorkbench(){if let url=webURL {NSWorkspace.shared.open(url)}else{status.stringValue="工作台还在启动，请稍候…"}}
    @objc func openData(){NSWorkspace.shared.open(data)}
    @objc func openGuide(){NSWorkspace.shared.open(resources.appendingPathComponent("使用说明.html"))}
    @objc func installSpeech(){install("speech",title:"安装语音字幕",detail:"联网下载模型和运行组件，建议预留 3 GB 空间。安装后可离线识别语音。")}
    @objc func installDesign(){install("design",title:"安装智能排版",detail:"需要下载数 GB 的本地模型，建议至少 16 GB 内存和 10 GB 剩余空间。基础模板封面无需安装此项。")}
    @objc func installCollector(){install("collector",title:"安装增强采集",detail:"下载第三方 MediaCrawler 及运行组件，约需 1–2 GB 空间；遵循其非商业学习用途许可证，平台仍可能要求扫码和验证。")}
    func install(_ feature:String,title:String,detail:String){
        guard webURL != nil else {status.stringValue="请等待工作台启动后再安装。";return}
        guard installer == nil else {status.stringValue="已有安装任务，请等待其完成。";return}
        let alert=NSAlert();alert.messageText=title;alert.informativeText=detail+"\n不会收费或自动订阅。";alert.addButton(withTitle:"开始下载");alert.addButton(withTitle:"暂不安装");guard alert.runModal() == .alertFirstButtonReturn else{return}
        do {let log=data.appendingPathComponent("安装日志.txt");FileManager.default.createFile(atPath:log.path,contents:nil);let handle=try FileHandle(forWritingTo:log);let p=Process();p.executableURL=resources.appendingPathComponent("runtime/bin/node");p.arguments=[resources.appendingPathComponent("desktop/install-feature.mjs").path,feature];p.environment=baseEnvironment();p.standardOutput=handle;p.standardError=handle
            p.terminationHandler={[weak self] p in DispatchQueue.main.async {self?.installer=nil;self?.status.stringValue=p.terminationStatus==0 ? "安装完成，可以返回工作台使用。" : "安装未完成，请检查网络后再次点击安装，详见数据文件夹中的安装日志。"}}
            try p.run();installer=p;status.stringValue="正在下载并安装，请保留此应用运行。可在数据文件夹查看安装日志。"
        } catch {status.stringValue="安装无法启动：\(error.localizedDescription)"}
    }
    func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool {window.makeKeyAndOrderFront(nil);return true}
    func applicationShouldTerminate(_ sender:NSApplication)->NSApplication.TerminateReply {
        if stopping{return .terminateNow};if installer != nil {let alert=NSAlert();alert.messageText="组件仍在安装";alert.informativeText="退出会中断下载，之后可重新安装。";alert.addButton(withTitle:"继续等待");alert.addButton(withTitle:"退出");if alert.runModal() == .alertFirstButtonReturn{return .terminateCancel}}
        stopping=true;installer?.terminate();timer?.invalidate();if let p=service,p.isRunning{p.terminate();DispatchQueue.global().async { p.waitUntilExit(); exit(0) };DispatchQueue.global().asyncAfter(deadline:.now()+20){if p.isRunning{kill(p.processIdentifier,SIGKILL)};exit(0)};return .terminateLater};return .terminateNow
    }
}
let app=NSApplication.shared;let delegate=Launcher();app.delegate=delegate;app.setActivationPolicy(.regular);app.run()
