# セキュリティについて

このリポジトリは GitHub Pages で公開している静的なページ（動画・アンケート・ゲーム）です。

## 問題を見つけたら

APIキーの混入や、ページの脆弱性に気づいた場合は、Issue には書かずに
このリポジトリの **Security → Report a vulnerability** から非公開で知らせてください。

## 秘密情報の扱い

- APIキー・パスワード・トークンはこのリポジトリに書き込みません。
  Apps Script で必要な値は「スクリプト プロパティ」に保存します。
- アンケートの送信先（`script.google.com/macros/s/…/exec`）はブラウザから送るための公開URLで、秘密情報ではありません。
- push と PR のたびに gitleaks が全履歴を確認し、GitHub の secret scanning と push protection も有効にしています。
