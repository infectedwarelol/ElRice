import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Effects

Rectangle {
    id: root
    width: 1920
    height: 1080
    color: "#1c1c1e"

    readonly property string textFont: "Inter"
    readonly property color glassFill: Qt.rgba(1, 1, 1, 0.20)
    readonly property color glassHover: Qt.rgba(1, 1, 1, 0.30)
    property string fallbackUserName: ""
    readonly property string userName: userModel.lastUser !== "" ? userModel.lastUser : fallbackUserName
    property var sessionNames: []
    property int sessionIndex: sessionModel.lastIndex >= 0 ? sessionModel.lastIndex : 0
    property bool loginFailed: false

    function attemptLogin() {
        if (passwordField.text.length === 0 || userName === "")
            return
        loginFailed = false
        sddm.login(userName, passwordField.text, sessionIndex)
    }

    Repeater {
        model: userModel
        delegate: Item {
            Component.onCompleted: {
                if (index === 0 && root.fallbackUserName === "")
                    root.fallbackUserName = model.name
            }
        }
    }

    Repeater {
        model: sessionModel
        delegate: Item {
            Component.onCompleted: {
                const names = root.sessionNames.slice()
                names[index] = model.name
                root.sessionNames = names
            }
        }
    }

    Connections {
        target: sddm
        function onLoginFailed() {
            root.loginFailed = true
            passwordField.text = ""
            passwordField.forceActiveFocus()
            shake.restart()
        }
    }

    Image {
        id: wallpaper
        anchors.fill: parent
        source: config.background
        fillMode: Image.PreserveAspectCrop
        asynchronous: false
        visible: false
    }

    MultiEffect {
        anchors.fill: parent
        source: wallpaper
        blurEnabled: true
        blurMax: 64
        blur: 1.0
        brightness: 0.05
        saturation: -0.1
    }

    Rectangle {
        anchors.fill: parent
        color: Qt.rgba(1, 1, 1, 0.08)
    }

    Timer {
        interval: 1000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: {
            const now = new Date()
            dateLabel.text = Qt.formatDate(now, "dddd, d MMMM")
            timeLabel.text = Qt.formatTime(now, "HH:mm")
        }
    }

    Column {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.topMargin: root.height * 0.08
        spacing: 0

        Text {
            id: dateLabel
            anchors.horizontalCenter: parent.horizontalCenter
            color: "white"
            font.family: root.textFont
            font.pixelSize: 24
            font.weight: Font.DemiBold
        }

        Text {
            id: timeLabel
            anchors.horizontalCenter: parent.horizontalCenter
            color: "white"
            font.family: root.textFont
            font.pixelSize: 120
            font.weight: Font.Bold
        }
    }

    Column {
        id: loginColumn
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: root.height * 0.12
        spacing: 14

        Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            width: 96
            height: 96
            radius: 48
            color: root.glassFill
            border.width: 1
            border.color: Qt.rgba(1, 1, 1, 0.25)

            Text {
                anchors.centerIn: parent
                text: root.userName.length > 0 ? root.userName.charAt(0).toUpperCase() : "?"
                color: "white"
                font.family: root.textFont
                font.pixelSize: 42
                font.weight: Font.DemiBold
            }
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.userName
            color: "white"
            font.family: root.textFont
            font.pixelSize: 20
            font.weight: Font.DemiBold
        }

        Item {
            id: fieldHolder
            anchors.horizontalCenter: parent.horizontalCenter
            width: 260
            height: 40

            SequentialAnimation {
                id: shake
                NumberAnimation { target: fieldHolder; property: "anchors.horizontalCenterOffset"; to: -12; duration: 50 }
                NumberAnimation { target: fieldHolder; property: "anchors.horizontalCenterOffset"; to: 12; duration: 80 }
                NumberAnimation { target: fieldHolder; property: "anchors.horizontalCenterOffset"; to: -8; duration: 70 }
                NumberAnimation { target: fieldHolder; property: "anchors.horizontalCenterOffset"; to: 0; duration: 60 }
            }

            TextField {
                id: passwordField
                anchors.fill: parent
                echoMode: TextInput.Password
                passwordCharacter: "●"
                placeholderText: "Enter Password"
                placeholderTextColor: Qt.rgba(1, 1, 1, 0.7)
                color: "white"
                font.family: root.textFont
                font.pixelSize: 15
                leftPadding: 18
                rightPadding: 44
                horizontalAlignment: TextInput.AlignLeft
                focus: true
                background: Rectangle {
                    radius: height / 2
                    color: passwordField.activeFocus ? root.glassHover : root.glassFill
                    border.width: 1
                    border.color: root.loginFailed ? Qt.rgba(1, 0.42, 0.38, 0.9) : Qt.rgba(1, 1, 1, 0.25)
                }
                Keys.onReturnPressed: root.attemptLogin()
                Keys.onEnterPressed: root.attemptLogin()
                Component.onCompleted: forceActiveFocus()
            }

            Rectangle {
                anchors.right: parent.right
                anchors.rightMargin: 6
                anchors.verticalCenter: parent.verticalCenter
                width: 28
                height: 28
                radius: 14
                visible: passwordField.text.length > 0
                color: submitArea.containsMouse ? "white" : Qt.rgba(1, 1, 1, 0.85)

                Text {
                    anchors.centerIn: parent
                    text: "→"
                    color: "#1c1c1e"
                    font.pixelSize: 16
                    font.weight: Font.Bold
                }

                MouseArea {
                    id: submitArea
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.attemptLogin()
                }
            }
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.loginFailed ? "Incorrect password" : ""
            color: "white"
            opacity: 0.85
            font.family: root.textFont
            font.pixelSize: 13
            height: 16
        }
    }

    Row {
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: 32
        spacing: 14

        Rectangle {
            height: 40
            width: sessionText.implicitWidth + 32
            radius: 20
            color: sessionArea.containsMouse ? root.glassHover : root.glassFill
            border.width: 1
            border.color: Qt.rgba(1, 1, 1, 0.25)

            Text {
                id: sessionText
                anchors.centerIn: parent
                text: root.sessionNames[root.sessionIndex] !== undefined ? root.sessionNames[root.sessionIndex] : "Session"
                color: "white"
                font.family: root.textFont
                font.pixelSize: 14
                font.weight: Font.DemiBold
            }

            MouseArea {
                id: sessionArea
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    const count = Math.max(1, sessionModel.rowCount())
                    root.sessionIndex = (root.sessionIndex + 1) % count
                }
            }
        }

        Repeater {
            model: [
                { label: "Sleep", glyph: "☾", visible: sddm.canSuspend, action: function() { sddm.suspend() } },
                { label: "Restart", glyph: "↻", visible: sddm.canReboot, action: function() { sddm.reboot() } },
                { label: "Shut Down", glyph: "⏻", visible: sddm.canPowerOff, action: function() { sddm.powerOff() } }
            ]

            delegate: Rectangle {
                required property var modelData
                visible: modelData.visible
                width: 40
                height: 40
                radius: 20
                color: powerArea.containsMouse ? root.glassHover : root.glassFill
                border.width: 1
                border.color: Qt.rgba(1, 1, 1, 0.25)

                Text {
                    anchors.centerIn: parent
                    text: modelData.glyph
                    color: "white"
                    font.pixelSize: 18
                }

                MouseArea {
                    id: powerArea
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: modelData.action()
                }
            }
        }
    }
}
