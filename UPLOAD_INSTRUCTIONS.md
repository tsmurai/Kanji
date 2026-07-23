# Excel 更新のアップロード方法

とても簡単です。Guest 用の Excel を更新したら、GitHub の「Upload files」ボタンを押してファイルを送るだけです。

## 1. Excel を更新する
- Guest 用に変更したい漢字や内容を反映した Excel を保存します
- ファイル名は「漢字の要.xlsx」のままにしてください

## 2. GitHub でアップロードする
1. GitHub のリポジトリページを開きます
2. 画面上の「Add file」ボタンを押します
3. 「Upload files」を選びます
4. 変更した Excel ファイルをドラッグ＆ドロップするか、ファイルを選びます
5. 画面下の「Commit changes」または「Submit changes」を押します

## 3. 反映を待つ
- アップロード後、GitHub Actions が自動で JSON に変換します
- 数分程度でアプリに反映されます

## 4. もしすぐ反映したいとき
- GitHub の「Actions」タブを開き、
  「Update Kanji Data」を選んで実行してください

## 5. ひとこと
- これだけで大丈夫です
- Guest 用の更新ファイルなら、
  GitHub の「Upload files」ボタンを押すところまでできればOKです
