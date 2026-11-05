# Detectra

Detección de animales y personas en imágenes y cámaras, con revisión humana de resultados. Frontend Next.js; API FastAPI; almacenamiento local o S3 y base de datos PostgreSQL/Neon.

## Modelo conservado

El proyecto distribuye **un único modelo: `yolov8s-oiv7`**, con los pesos originales de Ultralytics Open Images. Detecta oso, ave, gato, ciervo, perro, zorro, lagartija, persona, mapache, serpiente y ardilla. En **Settings** se eligen las categorías; deseleccionarlas todas desactiva las detecciones. El mismo detector se usa en imágenes y cámaras, con entrada de 640 y confianza predeterminada de 0,25. Si faltan pesos/configuración, el backend informa un error; no genera detecciones ficticias.

Se conserva por ser la opción multicategoría respaldada por la evaluación disponible. El híbrido experimental recuperó algunos objetos, pero añadió conflictos entre clases, errores de fusión y un coste de CPU considerable. **No hay una evaluación final independiente que justifique sustituir el original.**

La validación histórica de 214 imágenes dio 22 aciertos, 39 omisiones y recall de lagartijas de 36,1 %. La precisión del 100 % es **condicional a las clases anotadas**, no una precisión global: existen predicciones excluidas en imágenes con etiquetas parciales. Ambos métodos omitieron las dos lagartijas más pequeñas. Ninguno produjo alarmas en los 15 negativos verificados del manifiesto; la muestra es pequeña y ya fue examinada.

Los resultados, límites, hashes y comparación con el híbrido están en [`backend/models/yolov8s-oiv7/evaluation.json`](backend/models/yolov8s-oiv7/evaluation.json). Los datos, modelos descartados e informes de investigación se archivaron fuera del repositorio. No son necesarios para ejecutar la aplicación ni se publican con ella.

## Ejecutar en Windows

Requisitos: Python 3.13, Node.js y acceso a la base de datos PostgreSQL existente de Detectra. El esquema debe contener las tablas `cameras`, `models`, `trusted_persons`, `human_verifications`, `images` y `detections`; arrancar la API no crea ni reinicia la base de datos.

1. Copiar `backend/.env.example` a `backend/.env` y completar `DATABASE_URL`. Conservar el archivo privado fuera de Git.
2. Desde la raíz, ejecutar:

   ```powershell
   .\backend\run.ps1
   ```

   El lanzador crea un entorno en `%LOCALAPPDATA%\Detectra\venv`, instala las dependencias y arranca FastAPI en `http://127.0.0.1:8000`. La ruta corta evita problemas de Windows con PyTorch. `-SetupOnly` instala sin iniciar la API. Documentación de endpoints: `http://127.0.0.1:8000/docs`.

3. En otra terminal:

   ```powershell
   cd frontend
   npm ci
   Copy-Item .env.example .env.local
   npm run dev
   ```

   Abrir `http://localhost:3000`. Rutas: inicio, `/upload`, `/camera`, `/results`, `/settings` y `/how-to-use`. El navegador llama al proxy `/api/detectra/*`; `API_BASE_URL` es una variable exclusiva del servidor y debe apuntar al backend.

En otros sistemas se puede crear un entorno Python normal, instalar `backend/requirements.txt` y ejecutar `python -m uvicorn app.main:app` desde `backend`.

## Configuración y funcionamiento

- **Cámara:** `CAMERA_RTSP_URL` en `backend/.env`; las credenciales no se devuelven al navegador. **Scan Now** guarda el fotograma actual y sus detecciones. `CAMERA_SAVE_INTERVAL=0` desactiva los guardados automáticos; el valor predeterminado permite guardarlos cada 30 segundos cuando se supera `CAMERA_SAVE_CONFIDENCE`.
- **Imágenes:** sin `S3_BUCKET` se guardan en `backend/uploads/`, excluido de Git. Para S3/R2, completar las variables del ejemplo y una URL pública de lectura. `PUBLIC_API_URL` debe coincidir con el origen del backend configurado en el frontend.
- **Revisión humana:** los resultados guardados aceptan revisión por detección o por imagen usando un revisor existente en `trusted_persons`. El modo de demostración del frontend está separado de los resultados reales.
- **Modelo:** `backend/models/active.txt` fija el predeterminado distribuido. `LIZARD_MODEL` o una selección local válida pueden tener prioridad; no apuntar a modelos archivados. La API de selección se mantiene por compatibilidad. Las preferencias locales de categorías no se suben a Git.
- **Historial:** los registros existentes pueden mencionar versiones antiguas. Consultarlos o revisar sus detecciones no requiere conservar sus pesos en el servidor.

## Pruebas

Desde la raíz, después de instalar las dependencias:

```powershell
$python = "$env:LOCALAPPDATA/Detectra/venv/Scripts/python.exe"
$env:PYTHONPATH = (Resolve-Path backend).Path
& $python -m unittest discover -s backend/tests
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

Para las pruebas de navegador:

```powershell
cd frontend
npx playwright install chromium webkit
npm run test:e2e
```

Playwright utiliza servidores de prueba locales en los puertos 8101 y 3100 y respuestas simuladas; las pruebas no escriben en la base de datos de producción. Comprueban cargas, contratos, resultados, revisión, selección de categorías y Scan Now en Chromium de escritorio/móvil y WebKit. No sustituyen una prueba de campo de la cámara.

## Evaluar el detector

`backend/evaluate.py` ejecuta el detector real de la aplicación, valida sus respuestas y calcula TP/FP/FN, precisión, recall y F1 por clase. No inicia cámaras ni escribe en la base de datos. Usa todas las categorías y confianza 0,25 sin cambiar las preferencias guardadas.

El manifiesto JSON contiene una lista como esta; las cajas usan `[x, y, ancho, alto]` normalizados y deben incluir todos los objetos de las categorías soportadas:

```json
[{"id":"example-1","path":"images/example.jpg","split":"test",
  "truth":[["dog",[0.1,0.2,0.3,0.4]]],"complete_annotations":true}]
```

Para negativos, usar `truth: []`, `complete_annotations: true` y `verified_empty: true`. Las rutas relativas se resuelven desde el manifiesto. Las imágenes y las cajas deben tener la orientación normalizada. Evaluar con un nombre de salida nuevo:

```powershell
& "$env:LOCALAPPDATA/Detectra/venv/Scripts/python.exe" backend/evaluate.py --manifest C:/data/manifest.json --split test --out C:/data/results.json
```

Para reproducir únicamente la validación histórica archivada se puede usar `--allow-partial-annotations`, junto con `--original-root` y `--data-root` para reubicar las rutas. Esa opción registra las predicciones excluidas y marca explícitamente los resultados como condicionales, sin independencia. No ajustar el modelo ni los umbrales con un conjunto reservado para evaluación final.

## Contenido para GitHub

Código de la aplicación, pruebas, ejemplos de configuración, un modelo con sus metadatos/resultados, este README y las instrucciones de desarrollo de Next.js. Se excluyen secretos, preferencias locales, imágenes de usuarios, entornos, datos de entrenamiento y experimentos.

Referencia visual del proyecto: [diseño en Figma](https://www.figma.com/design/CNNQIPpuNQoz283NL0pyGe/Detectra?node-id=8-2).
