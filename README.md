# pdf-modify

사이트: https://pdf-modify.naranja.my/

`pdf-modify`는 사용자가 PDF 파일을 브라우저에서 바로 편집할 수 있도록 만든 무료 PDF 도구 사이트입니다. 파일을 서버에 업로드하거나 저장하지 않고, 사용자의 브라우저 안에서 PDF 처리와 변환 작업을 수행하는 것을 핵심 원칙으로 합니다.

## 주요 기능

- PDF 파일 업로드 및 페이지 미리보기
- 여러 PDF 파일을 하나로 병합
- 필요한 페이지만 선택해서 분할 또는 추출
- PDF 내부 페이지 순서 재정렬
- 미리보기 화면에서 마우스로 영역을 드래그해 PDF 크롭
- DOCX, PPTX 파일 업로드 시 PDF로 자동 변환 후 작업
- PDF를 Word 문서로 저장
- PDF를 PowerPoint 파일로 저장
- 한국어, 영어, 스페인어, 일본어 지원
- 사용자 브라우저 언어에 따른 기본 언어 자동 설정
- 개인정보처리방침 페이지 제공

## 파일 처리 방식

사용자가 선택한 파일은 서버로 전송되지 않습니다. PDF 병합, 분할, 재정렬, 크롭, 미리보기 렌더링, Word/PPT 변환은 모두 브라우저 안에서 처리됩니다. 페이지를 새로고침하거나 닫으면 선택한 파일과 작업 상태는 사라집니다.

## Word/PPT 변환 안내

`pdf-modify`는 최신 Office 형식인 `.docx`, `.pptx` 업로드를 지원합니다. 사용자가 Word 또는 PowerPoint 파일을 올리면 브라우저에서 PDF로 변환한 뒤 기존 PDF 편집 기능을 사용할 수 있습니다.

또한 PDF를 다시 Word 또는 PPT로 저장할 수 있습니다.

- Word 저장: PDF에서 추출 가능한 텍스트를 중심으로 `.docx` 파일을 생성합니다.
- PPT 저장: PDF 각 페이지를 이미지로 렌더링해 슬라이드에 배치한 `.pptx` 파일을 생성합니다.

브라우저 기반 변환이므로 Microsoft Office나 LibreOffice 같은 데스크톱 프로그램 수준의 완전한 서식 보존을 목표로 하지는 않습니다. 대신 별도 서버 없이 빠르고 비공개로 변환하는 데 초점을 둡니다.

## 개인정보 보호

`pdf-modify`는 아무 개인정보도 저장하지 않습니다. PDF 파일, 파일 이름, 문서 내용, 페이지 선택 정보, 크롭 영역, 병합 순서, 변환 작업 내용도 서버에 업로드하거나 저장하지 않습니다.

개인정보처리방침은 사이트 하단의 `개인정보처리방침` 버튼을 통해 확인할 수 있으며, 선택된 언어에 맞춰 표시됩니다.

## 배포

이 사이트는 Netlify 정적 사이트로 배포되도록 구성되어 있습니다.

- 배포 주소: https://pdf-modify.naranja.my/
- Netlify 설정: `netlify.toml`
- 검색 크롤러 허용: `robots.txt`

## 구성 파일

- `index.html`: PDF 편집, 변환, 다국어 UI가 포함된 메인 페이지
- `mcp-guide.html`: JSON-RPC, npm, npx, MCP 흐름과 `@drfirst/pdf-modify-mcp` 사용 구조를 설명하는 학습 페이지
- `privacy.html`: 다국어 개인정보처리방침 페이지
- `netlify.toml`: Netlify 정적 배포 설정
- `robots.txt`: 검색 엔진 크롤링 허용 설정

## MCP 서버

이 저장소에는 지금까지 구현한 PDF 기능을 로컬 자동화 도구로 사용할 수 있도록 `mcp-server/`가 추가되어 있습니다. 웹 UI인 `index.html`은 그대로 유지하고, MCP 서버는 파일 경로를 입력받아 결과 파일을 생성하는 방식으로 동작합니다.

MCP 개념과 `@drfirst/pdf-modify-mcp` 실행 흐름은 `mcp-guide.html`에도 정리되어 있습니다.

### 제공 도구

- `pdf_info`: PDF 파일의 페이지 수 등 기본 정보 확인
- `pdf_merge`: 여러 PDF 파일을 하나로 병합
- `pdf_split`: `1-3, 5, 8-10` 같은 페이지 범위로 PDF 추출
- `pdf_reorder`: 한 PDF 또는 여러 PDF의 페이지를 원하는 순서로 재정렬
- `pdf_crop`: PDF 페이지의 지정 영역을 포인트 좌표 기준으로 크롭
- `office_to_pdf`: `.docx`, `.pptx` 파일을 로컬에서 텍스트 기반 PDF로 변환
- `pdf_to_word`: PDF에서 추출 가능한 텍스트를 `.docx`로 저장
- `pdf_to_ppt`: PDF에서 추출 가능한 텍스트를 페이지별 슬라이드 `.pptx`로 저장

### 설치 및 실행

배포된 npm 패키지는 별도 clone 없이 바로 실행할 수 있습니다.

```bash
npx -y @drfirst/pdf-modify-mcp
```

로컬에서 개발할 때는 다음을 사용합니다.

```bash
cd mcp-server
npm install
npm run dev
```

빌드 후 실행하려면 다음을 사용합니다.

```bash
npm run build
npm run start
```

### VS Code MCP 연결

VS Code용 MCP 설정은 `.vscode/mcp.json`에 들어 있습니다.

```json
{
	"servers": {
		"pdf-modify-mcp": {
			"type": "stdio",
			"command": "npx",
			"args": ["-y", "@drfirst/pdf-modify-mcp"]
		}
	}
}
```

의존성을 설치한 뒤 VS Code에서 MCP 서버를 시작하면 `pdf-modify-mcp` 도구들을 사용할 수 있습니다.

### MCP 변환 제한사항

MCP 서버는 브라우저 UI와 달리 시각적 캔버스 렌더링을 사용하지 않습니다. 따라서 Office/PDF 변환은 자동화에 적합한 텍스트 중심 변환입니다.

- `.docx` → PDF: 문서 텍스트를 추출해 PDF로 생성합니다.
- `.pptx` → PDF: 슬라이드 텍스트를 추출해 페이지별 PDF로 생성합니다.
- PDF → Word/PPT: PDF에서 추출 가능한 텍스트를 Word 문서 또는 PPT 슬라이드로 저장합니다.

파일은 로컬 경로에서 읽고 로컬 경로로 저장됩니다. 별도 서버 업로드나 원격 저장은 하지 않습니다.
