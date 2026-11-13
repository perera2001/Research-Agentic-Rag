from typing import BinaryIO

import pymupdf
from langchain_core.documents import Document


class PdfLoadError(ValueError):
    pass


def load_pdf_pages(
    pdf_file: BinaryIO,
    *,
    user_id: int,
    document_id: int,
    file_name: str,
    file_path: str,
) -> tuple[int, list[Document]]:
    pdf_file.seek(0)
    pdf_bytes = pdf_file.read()
    if not pdf_bytes:
        raise PdfLoadError("The PDF file is empty.")

    try:
        with pymupdf.open(stream=pdf_bytes, filetype="pdf") as pdf:
            page_count = len(pdf)
            if page_count == 0:
                raise PdfLoadError("The PDF has no pages.")

            pages = []
            for page_number, page in enumerate(pdf, start=1):
                pages.append(
                    Document(
                        page_content=page.get_text("text", sort=True).strip(),
                        metadata={
                            "user_id": user_id,
                            "document_id": document_id,
                            "source": file_name,
                            "file_name": file_name,
                            "file_path": file_path,
                            "page_number": page_number,
                        },
                    )
                )
    except PdfLoadError:
        raise
    except Exception as exc:
        raise PdfLoadError("Could not read or extract text from the PDF.") from exc

    if not any(page.page_content for page in pages):
        raise PdfLoadError("No extractable text was found in the PDF.")
    return page_count, pages
