tell application "Terminal"
    activate
    do script "bash $HOME/Projects/web-inputer/ios/Scripts/archive-gui.sh > /tmp/remote-input-gui-archive.log 2>&1; echo $? > /tmp/remote-input-gui-archive.status"
end tell
