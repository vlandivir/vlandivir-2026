import SwiftUI
import UIKit

struct TaskAttachmentsView: View {
    let attachments: [GtdAttachmentDTO]
    let api: APIClient
    @State private var opened: OpenedImage?

    var body: some View {
        if attachments.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(attachments) { attachment in
                    AttachmentPreview(attachment: attachment, api: api) { image in
                        opened = OpenedImage(id: attachment.id, image: image)
                    }
                }
            }
            .fullScreenCover(item: $opened) { item in
                ZStack {
                    Color.black.ignoresSafeArea()
                    Image(uiImage: item.image)
                        .resizable()
                        .scaledToFit()
                        .padding()
                }
                .onTapGesture { opened = nil }
                .overlay(alignment: .topTrailing) {
                    Button {
                        opened = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title)
                            .symbolRenderingMode(.hierarchical)
                            .foregroundStyle(.white)
                    }
                    .padding()
                    .accessibilityLabel("Close")
                }
            }
        }
    }
}

private struct OpenedImage: Identifiable {
    var id: String
    var image: UIImage
}

private struct AttachmentPreview: View {
    let attachment: GtdAttachmentDTO
    let api: APIClient
    var onOpenImage: (UIImage) -> Void

    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        Group {
            if attachment.isImage {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 360)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .contentShape(Rectangle())
                        .onTapGesture { onOpenImage(image) }
                        .accessibilityLabel(attachment.originalName)
                } else if failed {
                    Label(attachment.originalName, systemImage: "photo")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .frame(height: 160)
                }
            } else {
                Label(attachment.originalName, systemImage: "paperclip")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .task(id: attachment.id) {
            guard attachment.isImage else { return }
            do {
                let data = try await api.downloadAttachment(id: attachment.id)
                image = UIImage(data: data)
                failed = image == nil
            } catch {
                failed = true
            }
        }
    }
}
