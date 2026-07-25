# 📝 漢字アプリ ― Excel 更新のアップロード方法

> 社会(暗記アプリ)の資料アップロードをお探しの場合はこちら → [📘 社会アプリのアップロード手順](https://github.com/tsmurai/Shakai/blob/main/UPLOAD_INSTRUCTIONS.md)

とても簡単です。苦手漢字リストの Excel を更新したら、GitHub の「Upload files」ボタンを押してファイルを送るだけです。

**リポジトリのページ**: https://github.com/tsmurai/Kanji
**アプリ本体**: https://tsmurai.github.io/Kanji/

## 1. Excel を更新する
- 変更したい漢字や内容を反映した Excel を保存します
- ファイル名は「漢字の要.xlsx」のままにしてください

## 2. GitHub でアップロードする
1. 上のリポジトリのページを開きます(要ログイン)
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
