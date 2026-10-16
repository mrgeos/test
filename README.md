# Портфолио GEOGLYF: брендинг и айдентика

Статичный сайт для GitHub Pages. Без сборки, без зависимостей.

## Публикация

1. Создайте репозиторий на GitHub (например, `branding`).
2. Загрузите в него содержимое этой папки: `index.html`, `.nojekyll`, папку `img`.
3. Settings → Pages → Source: **Deploy from a branch**, ветка `main`, папка `/ (root)`.
4. Через минуту сайт будет доступен по адресу `https://<логин>.github.io/<репозиторий>/`.

Через терминал:

```bash
cd site
git init && git add . && git commit -m "Портфолио"
git branch -M main
git remote add origin https://github.com/<логин>/<репозиторий>.git
git push -u origin main
```

## Как добавить проект

1. Экспортируйте страницы PDF в JPG шириной 2000 px:
   `pdftoppm -jpeg -jpegopt quality=82,progressive=y -scale-to 2000 brandbook.pdf img/<slug>/p`
2. Сделайте обложку: `convert img/<slug>/p-01.jpg -resize 1400x -quality 80 img/<slug>/cover.jpg`
3. Добавьте объект в массив `PROJECTS` в `index.html` (название, клиент, тег, год, число страниц, размеры страницы).

Ссылка на конкретный проект: `.../#bonami`, `.../#karlson` и т.д.
