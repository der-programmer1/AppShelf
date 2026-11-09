import base64
import binascii
from io import BytesIO
import warnings
from PIL import Image, ImageOps
import pypdfium2 as pdfium
from models import Upload

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_PAGES = 3
MAX_PIXELS = 25_000_000
MAX_PREPARED_BYTES = 600_000


class MediaError(ValueError):
    pass


def jpeg_data_url(image):
    image = ImageOps.exif_transpose(image)
    image.thumbnail((1800, 1800))
    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        clean = Image.new("RGB", rgba.size, "white")
        clean.paste(rgba, mask=rgba.getchannel("A"))
    else:
        clean = image.convert("RGB")
    for quality in (88, 78, 65, 50):
        output = BytesIO()
        clean.save(output, format="JPEG", quality=quality, optimize=True)
        data = output.getvalue()
        if len(data) <= MAX_PREPARED_BYTES:
            return "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii")
    raise MediaError("Das Bild enthält zu viele Details. Bitte einen kleineren Ausschnitt hochladen.")


def prepare_files(files: list[Upload]):
    prepared = []
    for index, upload in enumerate(files, 1):
        try:
            data = base64.b64decode(upload.data, validate=True)
        except (ValueError, binascii.Error) as error:
            raise MediaError("Ungültige Dateikodierung.") from error
        if not data or len(data) > MAX_FILE_BYTES:
            raise MediaError("Jede Datei darf höchstens 8 MB groß sein.")
        if upload.mime == "application/pdf":
            if not data.startswith(b"%PDF-"):
                raise MediaError("Die Datei ist kein PDF.")
            try:
                with pdfium.PdfDocument(data) as pdf:
                    if not 1 <= len(pdf) <= MAX_PAGES - len(prepared):
                        raise MediaError("Insgesamt sind höchstens drei PDF-Seiten oder Fotos möglich.")
                    for page_index in range(len(pdf)):
                        page = pdf[page_index]
                        try:
                            width, height = page.get_size()
                            if min(width, height) <= 0 or max(width, height) > 20000:
                                raise MediaError("Ungültige PDF-Seitengröße.")
                            bitmap = page.render(scale=min(2, 1800 / max(width, height)))
                            try:
                                with bitmap.to_pil() as image:
                                    prepared.append((f"Dokument {index}, Seite {page_index + 1}", jpeg_data_url(image)))
                            finally:
                                bitmap.close()
                        finally:
                            page.close()
            except MediaError:
                raise
            except Exception as error:
                raise MediaError("Das PDF ist beschädigt oder passwortgeschützt.") from error
        else:
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("error", Image.DecompressionBombWarning)
                    with Image.open(BytesIO(data)) as image:
                        expected = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}[upload.mime]
                        if image.format != expected or image.width * image.height > MAX_PIXELS or getattr(image, "n_frames", 1) != 1:
                            raise MediaError("Bitte ein einzelnes JPEG-, PNG- oder WebP-Foto mit höchstens 25 Megapixeln wählen.")
                        image.load()
                        prepared.append((f"Foto {index}", jpeg_data_url(image)))
            except MediaError:
                raise
            except Exception as error:
                raise MediaError("Das Foto lässt sich nicht lesen. Bitte JPEG, PNG oder WebP verwenden.") from error
        if len(prepared) > MAX_PAGES:
            raise MediaError("Insgesamt sind höchstens drei PDF-Seiten oder Fotos möglich.")
    return prepared
